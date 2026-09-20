/**
 * 手动云同步协调层。网络、浏览器、时钟与存储均可注入；不启动后台同步。
 * 密码/恢复密钥仅在凭据操作调用内使用，不进入持久化状态或日志。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QinshiCloudSync = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024;
  var WRITE_LEASE_RENEW_INTERVAL_MS = 15000;
  var MIN_LOCAL_WRITE_WINDOW_MS = 30000;

  function encode(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('密文编码不正确。');
    var raw = root.atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = Uint8Array.from(raw, function (character) { return character.charCodeAt(0); });
    if (encode(bytes) !== value) throw new Error('密文编码不正确。');
    return bytes;
  }

  function normalizeSyncCode(value) {
    if (typeof value !== 'string' || !/^[A-Za-z2-7 -]+$/.test(value.trim())) throw new Error('同步码格式不正确。');
    var code = value.trim().replace(/[ -]/g, '').toUpperCase();
    if (!/^[A-Z2-7]{26,80}$/.test(code)) throw new Error('同步码格式不正确。');
    return code;
  }

  function createSettingsState() {
    var dashboard = { deviceId: '', devices: [] };
    var sourceItems = [];
    var historyItems = [];
    var selected = null;
    var preview = null;
    var overwriteConfirmed = false;
    var recoveryAcknowledged = false;
    var writeInFlight = false;

    function snapshotTime(item) {
      var value = item && item.snapshot && item.snapshot.serverCreatedAt;
      if (typeof value === 'number') return value;
      var parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function setDashboard(value) {
      dashboard = value && Array.isArray(value.devices) ? value : { deviceId: '', devices: [] };
      sourceItems = [];
      historyItems = [];
      dashboard.devices.forEach(function (device) {
        if (!device || device.revoked) return;
        if (device.deviceId === dashboard.deviceId) {
          historyItems = (device.historySnapshots || []).slice().sort(function (a, b) {
            return snapshotTime({ snapshot: b }) - snapshotTime({ snapshot: a });
          });
          return;
        }
        if (device.latestSnapshot) sourceItems.push({ device: device, snapshot: device.latestSnapshot, badge: '最新' });
        (device.historySnapshots || []).forEach(function (snapshot) {
          sourceItems.push({ device: device, snapshot: snapshot, badge: '历史' });
        });
      });
      sourceItems.sort(function (a, b) { return snapshotTime(b) - snapshotTime(a); });
      selected = null;
      preview = null;
      overwriteConfirmed = false;
    }

    function withWriteLock(action, onChange) {
      if (writeInFlight) return Promise.resolve(false);
      writeInFlight = true;
      if (onChange) onChange(true);
      return Promise.resolve().then(action).finally(function () {
        writeInFlight = false;
        if (onChange) onChange(false);
      });
    }

    return {
      setDashboard: setDashboard,
      dashboard: function () { return dashboard; },
      sources: function () { return sourceItems.slice(); },
      currentHistory: function () { return historyItems.slice(); },
      selectedSource: function () { return selected; },
      selectSource: function (snapshotId) {
        selected = sourceItems.find(function (item) { return item.snapshot.snapshotId === snapshotId; }) || null;
        preview = null;
        overwriteConfirmed = false;
        return selected;
      },
      setPreview: function (value) { preview = value || null; overwriteConfirmed = false; },
      preview: function () { return preview; },
      setOverwriteConfirmed: function (value) { overwriteConfirmed = value === true; },
      canConfirmOverwrite: function () { return Boolean(preview && overwriteConfirmed && !writeInFlight); },
      setRecoveryAcknowledged: function (value) { recoveryAcknowledged = value === true; },
      canDismissRecovery: function () { return recoveryAcknowledged; },
      withWriteLock: withWriteLock,
      writeInFlight: function () { return writeInFlight; }
    };
  }

  function createSync(dependencies) {
    var options = dependencies || {};
    var pendingUpload = null; // Same-page retries reuse immutable ciphertext, never recollect data.
    var pendingEnrollment = null; // Request proof only; never password or recovery key, never persisted.
    var pendingSecurity = null; // Immutable lifecycle proof for same-page retry, never raw credentials.
    var busy = false;
    var preparedPulls = new WeakMap(); // Preview handles never expose plaintext or pairing credentials.
    var revokedPairings = new WeakMap(); // Supports frozen errors without publishing credentials.

    function dependency(name, globalName) {
      var value = options[name] || root[globalName];
      if (!value) throw new Error('云同步依赖不可用。');
      return value;
    }
    function api() { return dependency('api', 'QinshiCloudSyncApi'); }
    function storage() { return dependency('storage', 'QinshiCloudSyncStorage'); }
    function cryptoApi() { return dependency('cryptoApi', 'QinshiCloudSyncCrypto'); }
    function core() { return dependency('core', 'QinshiCloudSyncCore'); }
    function webCrypto() { return dependency('webCrypto', 'crypto'); }
    function version() {
      var value = options.appVersion || (root.QinshiPWA && root.QinshiPWA.version);
      if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('请先更新工具后再继续同步。');
      return value;
    }
    function now() { return options.now ? options.now() : new Date().toISOString(); }
    function uuid() { return options.randomUUID ? options.randomUUID() : webCrypto().randomUUID(); }

    function pairingIdentity(pairing) {
      if (!pairing || ['spaceId', 'deviceId', 'deviceToken'].some(function (field) {
        return typeof pairing[field] !== 'string' || !pairing[field];
      })) return null;
      return Object.freeze({ spaceId: pairing.spaceId, deviceId: pairing.deviceId, deviceToken: pairing.deviceToken });
    }

    function samePairing(left, right) {
      return left && right && ['spaceId', 'deviceId', 'deviceToken'].every(function (field) { return left[field] === right[field]; });
    }

    async function authenticatedCall(method, args, expected) {
      var transport = api();
      // Injected transports may not expose request identity. Capture their
      // expected identity before dispatch, never after notification/user input.
      var captured = pairingIdentity(expected === undefined ? await storage().loadPairing() : expected);
      try { return await transport[method].apply(transport, args); }
      catch (error) {
        if (error && error.code === 'DEVICE_REVOKED' && error.pairingInvalid === true) {
          var actual;
          try { if (typeof transport.getRevokedPairing === 'function') actual = pairingIdentity(transport.getRevokedPairing(error)); }
          catch (lookupError) { /* Keep the original error and conservative pre-dispatch identity. */ }
          if (actual || captured) revokedPairings.set(error, actual || captured);
        }
        throw error;
      }
    }

    async function handleFailure(error) {
      if (error && error.code === 'DEVICE_REVOKED' && error.pairingInvalid === true) {
        var expected = revokedPairings.get(error);
        if (pendingUpload && samePairing(pendingUpload.pairing, expected)) pendingUpload = null;
        if (pendingEnrollment && samePairing({ spaceId: pendingEnrollment.spaceId,
          deviceId: pendingEnrollment.device.deviceId, deviceToken: pendingEnrollment.device.deviceToken }, expected)) pendingEnrollment = null;
        // UI may await the notice before local credentials disappear. Without an
        // injected callback this is a no-op; the original safe API error still reaches UI.
        try {
          if (typeof options.notifyPairingInvalid === 'function') {
            await options.notifyPairingInvalid(Object.freeze({ code: 'DEVICE_REVOKED',
              message: '本设备的配对已失效或被撤销，请重新配对。' }));
          }
        } catch (noticeError) { /* Never expose callback details or hide revocation. */ }
        try { if (expected) await storage().forgetPairingIfCurrent(expected); }
        catch (cleanupError) { /* Preserve the original error, including frozen errors. */ }
      }
      throw error;
    }

    async function exclusive(action) {
      if (busy) throw new Error('同步操作正在进行，请稍后重试。');
      busy = true;
      try { return await action(); }
      catch (error) { return await handleFailure(error); }
      finally { busy = false; }
    }

    async function preflight(pending) {
      var limits = await api().health();
      var result = await dependency('pwa', 'QinshiPWA').ensureCurrentForSync(limits);
      if (!result || result.ready !== true) {
        if (pending && result && result.updateRequired === true) {
          await storage().savePendingOperation(pending);
          var pwa = dependency('pwa', 'QinshiPWA');
          if (typeof pwa.applyUpdate === 'function') await pwa.applyUpdate();
        }
        throw new Error('请先完成版本检查或更新工具后再继续同步。');
      }
      core().assertVersionAllowed(version(), limits, 'write');
      return limits;
    }

    async function requirePairing() {
      var pairing = await storage().loadPairing();
      if (!pairing) throw new Error('请先配对云同步设备。');
      return pairing;
    }

    async function requireUnpaired() {
      if (pendingSecurity) throw new Error('请先处理已有同步操作。');
      if (pendingEnrollment) throw new Error('已有配对操作待恢复，请重试恢复或忘记当前设备后再继续。');
      if (await storage().loadPairing()) throw new Error('本机已配对，请先忘记当前设备。');
    }

    function detectDeviceName() {
      var navigator = options.navigator || root.navigator || {};
      var ua = navigator.userAgent || '';
      if (/iPhone/i.test(ua)) return 'iPhone 设备';
      if (/iPad/i.test(ua) || (/Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1)) return 'iPad 设备';
      if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android 手机' : 'Android 平板';
      if (/Windows/i.test(ua) || /Win/i.test(navigator.platform || '')) return 'Windows 设备';
      return '浏览器设备';
    }

    function deviceName(value) {
      if (value === undefined) return detectDeviceName();
      if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value.trim()).length > 1024) throw new Error('设备名称不正确。');
      return value.trim();
    }

    function generateSyncCode() {
      // 17 independent random bytes carry 136 bits; Base32 padding carries no entropy.
      var bytes = webCrypto().getRandomValues(new Uint8Array(17));
      var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      var code = '', bits = 0, buffer = 0;
      bytes.forEach(function (byte) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) { bits -= 5; code += alphabet[(buffer >>> bits) & 31]; }
      });
      if (bits) code += alphabet[(buffer << (5 - bits)) & 31];
      return code;
    }

    function metadataAad(purpose, context) {
      return new TextEncoder().encode(core().canonicalStringify(['qinshi-sync/metadata/v1',
        purpose, 1, 'AES-256-GCM', context]));
    }

    async function metadataKey(masterKey, usage) {
      var bytes = decode(masterKey);
      try {
        if (bytes.length !== 32) throw new Error('主密钥格式不正确。');
        return await webCrypto().subtle.importKey('raw', bytes, 'AES-GCM', false, [usage]);
      } finally { bytes.fill(0); }
    }

    async function encryptMetadata(value, masterKey, purpose, context) {
      var iv = webCrypto().getRandomValues(new Uint8Array(12));
      var bytes = new TextEncoder().encode(JSON.stringify(value));
      try {
        var encrypted = await webCrypto().subtle.encrypt({ name: 'AES-GCM', iv: iv, tagLength: 128,
          additionalData: metadataAad(purpose, context) }, await metadataKey(masterKey, 'encrypt'), bytes);
        return { version: 1, algorithm: 'AES-256-GCM', iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
      } finally { bytes.fill(0); }
    }

    async function decryptMetadata(record, masterKey, purpose, context) {
      var bytes;
      try {
        if (!record || record.version !== 1 || record.algorithm !== 'AES-256-GCM' ||
          typeof record.ciphertext !== 'string' || record.ciphertext.length > 5462) throw new Error();
        var iv = decode(record.iv);
        if (iv.length !== 12) throw new Error();
        bytes = new Uint8Array(await webCrypto().subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128,
          additionalData: metadataAad(purpose, context) }, await metadataKey(masterKey, 'decrypt'), decode(record.ciphertext)));
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch (error) { throw new Error('同步元数据校验失败。'); }
      finally { if (bytes) bytes.fill(0); }
    }

    function nameContext(spaceId, deviceId) { return { spaceId: spaceId, deviceId: deviceId }; }

    function summaryContext(spaceId, deviceId, metadata) {
      var context = { spaceId: spaceId, deviceId: deviceId };
      ['snapshotId', 'sourceSnapshotId', 'appVersion', 'formatVersion', 'schemaVersion', 'encoding',
        'clientCreatedAt', 'dataHash', 'iv', 'ciphertextBytes', 'chunkCount', 'ciphertextDigest'].forEach(function (field) {
        context[field] = metadata[field];
      });
      return context;
    }

    async function localDevice(name, spaceId, masterKey) {
      var deviceId = uuid();
      return { deviceId: deviceId, deviceToken: cryptoApi().randomId(32),
        encryptedName: await encryptMetadata({ deviceName: name }, masterKey, 'device-name', nameContext(spaceId, deviceId)) };
    }

    async function savePairing(response, spaceId, device, name, masterKey, expected) {
      if (!response || response.spaceId !== spaceId || response.deviceId !== device.deviceId) throw new Error('同步服务配对响应不正确。');
      core().assertVersionAllowed(version(), response, 'write');
      var saved = { spaceId: spaceId, deviceId: device.deviceId,
        deviceToken: device.deviceToken, masterKey: masterKey, deviceName: name, pairedAt: now() };
      if (expected !== undefined) await storage().replacePairingIfCurrent(expected, saved);
      else await storage().savePairing(saved);
    }

    async function finishEnrollment(pending) {
      var current = await storage().loadPairing();
      if (current && (current.spaceId !== pending.spaceId || current.deviceId !== pending.device.deviceId)) {
        throw new Error('待恢复配对与本机已有配对不匹配。');
      }
      if (!pending.response) {
        pending.response = pending.operation === 'create'
          ? await api().createSpace(pending.body, pending.operationId)
          : await api().pair(pending.syncCode, pending.body, pending.operationId);
      }
      await savePairing(pending.response, pending.spaceId, pending.device, pending.name, pending.masterKey);
      // Persistence failures retry just persistence; once paired, an initial upload
      // failure belongs to upload recovery and must not replay enrollment.
      pendingEnrollment = null;
      if (pending.operation === 'join') return { status: 'joined', deviceId: pending.device.deviceId };
      var upload = await uploadCurrent();
      return { status: 'created', syncCode: pending.syncCode, deviceId: pending.device.deviceId, upload: upload };
    }

    async function createSpace(input) {
      return exclusive(async function () {
        if (!input || typeof input.password !== 'string' || !input.password || input.password !== input.confirmPassword) throw new Error('两次输入的密码必须一致且不能为空。');
        var name = deviceName(input.deviceName);
        var confirm = input.confirmRecoveryCredentials || options.confirmRecoveryCredentials;
        if (typeof confirm !== 'function') throw new Error('请先提供恢复密钥保存确认。');
        await requireUnpaired();
        await preflight();
        var syncCode = generateSyncCode();
        var spaceId = uuid();
        var masterKey = cryptoApi().generateMasterKey();
        var kdf = cryptoApi().generateKdfParams();
        var recovery = await cryptoApi().generateRecoveryKey();
        var passwordKeys = await cryptoApi().derivePasswordKeys(input.password, kdf);
        var recoveryKeys = await cryptoApi().deriveRecoveryKeys(recovery.recoveryKey, kdf.salt);
        var device = await localDevice(name, spaceId, masterKey);
        var body = { syncCode: syncCode, spaceId: spaceId, kdf: kdf, authKey: passwordKeys.authKey,
          passwordWrappedMaster: await cryptoApi().wrapMasterKey(masterKey, passwordKeys.wrappingKey, spaceId),
          recoveryAuthKey: recoveryKeys.authKey,
          recoveryWrappedMaster: await cryptoApi().wrapMasterKey(masterKey, recoveryKeys.wrappingKey, spaceId),
          device: device, appVersion: version() };
        // UI owns display/copy/download. Only explicit true acknowledges saving;
        // closing/cancelling (false/undefined) cannot create an orphaned space.
        var acknowledged = await confirm(Object.freeze({ syncCode: syncCode, recoveryKey: recovery.displayKey }));
        recovery = null; recoveryKeys = null; passwordKeys = null;
        if (acknowledged !== true) throw new Error('请确认已保存恢复密钥。');
        pendingEnrollment = { operation: 'create', operationId: uuid(), syncCode: syncCode,
          spaceId: spaceId, device: device, name: name, masterKey: masterKey, body: body };
        return finishEnrollment(pendingEnrollment);
      });
    }

    async function joinSpace(input) {
      return exclusive(async function () {
        if (!input || typeof input.password !== 'string' || !input.password) throw new Error('请输入同步密码。');
        var code = normalizeSyncCode(input.syncCode);
        var name = deviceName(input.deviceName);
        await requireUnpaired();
        await preflight();
        var params = await api().getParameters(code);
        core().assertVersionAllowed(version(), params, 'write');
        var keys = await cryptoApi().derivePasswordKeys(input.password, params.kdf);
        var masterKey = await cryptoApi().unwrapMasterKey(params.passwordWrappedMaster, keys.wrappingKey, params.spaceId);
        var device = await localDevice(name, params.spaceId, masterKey);
        pendingEnrollment = { operation: 'join', operationId: uuid(), syncCode: code,
          spaceId: params.spaceId, device: device, name: name, masterKey: masterKey,
          body: { authKey: keys.authKey, device: device, appVersion: version() } };
        return finishEnrollment(pendingEnrollment);
      });
    }

    async function authenticatedSnapshot(metadata, pairing, deviceId) {
      if (!metadata) return null;
      if (metadata.deviceId !== deviceId) throw new Error('同步元数据校验失败。');
      var summary = await decryptMetadata(metadata.encryptedSummary, pairing.masterKey, 'snapshot-summary',
        summaryContext(pairing.spaceId, deviceId, metadata));
      if (!summary || summary.dataHash !== metadata.dataHash) throw new Error('同步元数据校验失败。');
      return Object.assign({}, metadata, { dataHash: summary.dataHash });
    }

    async function dashboard(pairing) {
      var result = await authenticatedCall('listDevices', [], pairing);
      if (!result || !Array.isArray(result.devices)) throw new Error('设备列表不正确。');
      var devices = [];
      for (var row of result.devices) {
        var name = await decryptMetadata(row.encryptedName, pairing.masterKey, 'device-name', nameContext(pairing.spaceId, row.deviceId));
        if (!name || typeof name.deviceName !== 'string') throw new Error('同步元数据校验失败。');
        var latest = await authenticatedSnapshot(row.latestSnapshot, pairing, row.deviceId);
        var history = [];
        if (!Array.isArray(row.historySnapshots)) throw new Error('设备列表不正确。');
        for (var snapshot of row.historySnapshots) history.push(await authenticatedSnapshot(snapshot, pairing, row.deviceId));
        devices.push({ deviceId: row.deviceId, deviceName: name.deviceName, current: row.deviceId === pairing.deviceId,
          revoked: row.revoked, revokedAt: row.revokedAt, lastUsedAt: row.lastUsedAt, lastUploadedAt: row.lastUploadedAt,
          createdAt: row.createdAt, latestSnapshot: latest, historySnapshots: history });
      }
      return { paired: true, deviceId: pairing.deviceId, deviceName: pairing.deviceName, devices: devices };
    }

    async function getDashboard() {
      try {
        var pairing = await storage().loadPairing();
        return pairing ? await dashboard(pairing) : { paired: false, devices: [] };
      } catch (error) { return handleFailure(error); }
    }

    async function sendUpload(pending) {
      if (pending.phase !== 'commit-pending') {
        var session = await authenticatedCall('createUpload', [pending.body, pending.operationId]);
        if (!session || session.snapshotId !== pending.body.snapshotId || typeof session.uploadId !== 'string' ||
          !Array.isArray(session.uploadedChunks)) throw new Error('上传会话响应不正确。');
        pending.uploadId = session.uploadId;
        for (var chunk of pending.chunks) {
          if (session.uploadedChunks.indexOf(chunk.index) === -1) {
            await authenticatedCall('putChunk', [session.uploadId, chunk.index, decode(chunk.data), chunk.digest]);
          }
        }
        // A committed receipt outlives snapshot/history ciphertext. Once a commit
        // might have reached the server, replay it directly; never put chunks again.
        pending.commitBody = { beforeUploadId: null, sourceSnapshotId: null };
        pending.phase = 'commit-pending';
      }
      var committed;
      try {
        committed = await authenticatedCall('commitUpload', [pending.uploadId, pending.commitBody, pending.operationId]);
      } catch (error) {
        // Only a definitive HTTP 404 from commit proves the old session is gone.
        // Preserve immutable ciphertext/request identity and let the next explicit
        // retry create a replacement session; all ambiguous failures stay commit-first.
        if (error && error.status === 404) {
          pending.phase = 'uploading';
          delete pending.uploadId;
          delete pending.commitBody;
        }
        throw error;
      }
      if (!committed || committed.latestSnapshotId !== pending.body.snapshotId || committed.operationId !== pending.uploadId) throw new Error('上传提交响应不正确。');
      await storage().clearPendingOperation();
      pendingUpload = null;
      return { status: 'uploaded', snapshotId: committed.latestSnapshotId };
    }

    async function uploadCurrent() {
      if (pendingSecurity) throw new Error('请先处理已有同步操作。');
      // Health + PWA gate happens before reading qinshi_ or doing snapshot crypto.
      await preflight();
      await assertNoRollback();
      var pairing = await requirePairing();
      if (pendingUpload) {
        if (pendingUpload.deviceId !== pairing.deviceId || pendingUpload.spaceId !== pairing.spaceId) throw new Error('续传设备与当前配对不匹配。');
        return sendUpload(pendingUpload);
      }
      var envelope = await core().createSnapshotEnvelope({ appVersion: version(), sourceDeviceId: pairing.deviceId,
        clientCreatedAt: now(), data: dependency('settings', 'QinshiSettings').collectManagedData() });
      var current = (await dashboard(pairing)).devices.find(function (device) { return device.current; });
      if (!current || current.revoked) throw new Error('当前配对设备不可用。');
      if (current.latestSnapshot && current.latestSnapshot.dataHash === envelope.dataHash) {
        await storage().clearPendingOperation();
        return { status: 'unchanged', message: '本机数据无变化' };
      }
      var snapshotId = uuid();
      var record = await cryptoApi().encryptSnapshot(envelope, pairing.masterKey, Object.assign({}, envelope,
        { spaceId: pairing.spaceId, snapshotId: snapshotId }));
      var bytes = decode(record.ciphertext);
      if (bytes.length > MAX_CIPHERTEXT_BYTES) throw new Error('快照密文不能超过 10 MiB。');
      var chunks = await cryptoApi().chunkCiphertext(bytes);
      var body = { operation: 'upload', snapshotId: snapshotId, sourceSnapshotId: null, appVersion: envelope.appVersion,
        formatVersion: envelope.formatVersion, schemaVersion: envelope.schemaVersion, encoding: record.encoding,
        clientCreatedAt: envelope.clientCreatedAt, dataHash: envelope.dataHash, iv: record.iv,
        ciphertextBytes: chunks.byteLength, chunkCount: chunks.chunks.length, ciphertextDigest: chunks.digest };
      body.encryptedSummary = await encryptMetadata({ dataHash: envelope.dataHash }, pairing.masterKey, 'snapshot-summary',
        summaryContext(pairing.spaceId, pairing.deviceId, body));
      pendingUpload = { phase: 'uploading', operationId: uuid(), spaceId: pairing.spaceId,
        deviceId: pairing.deviceId, pairing: pairingIdentity(pairing), body: body, chunks: chunks.chunks };
      await storage().savePendingOperation({ type: 'upload', snapshotId: snapshotId });
      return sendUpload(pendingUpload);
    }

    async function assertNoRollback() {
      if (await storage().loadRollbackCopy()) throw new Error('存在未处理的回滚副本，请先恢复覆盖前数据或明确保留当前数据。');
    }

    async function assertNoOtherPending(type, snapshotId) {
      if (pendingUpload || pendingEnrollment || pendingSecurity) throw new Error('请先处理已有同步操作。');
      var pending = await storage().loadPendingOperation();
      if (pending && (pending.type !== type || pending.snapshotId !== snapshotId)) throw new Error('请先处理已有同步操作。');
    }

    function requireLeaseWindow(expiresAt) {
      var time = options.recoveryNow ? options.recoveryNow() : Date.now();
      if (!Number.isSafeInteger(time) || !Number.isSafeInteger(expiresAt) || expiresAt - time < MIN_LOCAL_WRITE_WINDOW_MS) {
        var expired = new Error('回滚写入租约已失效，请重新选择恢复操作。');
        expired.code = 'ROLLBACK_CONFLICT';
        throw expired;
      }
    }

    async function startWriteLease(ownerId) {
      var fenceId = uuid();
      await storage().acquireRollbackWrite(ownerId, fenceId);
      var active = true, failure = null, renewing = null;
      async function renew() {
        if (failure) throw failure;
        var copy = await storage().renewRollbackWrite(ownerId, fenceId);
        requireLeaseWindow(copy.writeLeaseUntil);
        return copy;
      }
      var timer = (options.setInterval || root.setInterval)(function () {
        if (!active || renewing) return renewing;
        renewing = renew().catch(function (error) { if (active) failure = error; })
          .finally(function () { renewing = null; });
        return renewing;
      }, WRITE_LEASE_RENEW_INTERVAL_MS);
      return { fenceId: fenceId, renew: renew, stop: function () {
        active = false;
        (options.clearInterval || root.clearInterval)(timer);
      } };
    }

    async function readSource(snapshotId, pairing) {
      var metadata = await authenticatedCall('getSnapshot', [snapshotId], pairing);
      if (!metadata || metadata.snapshotId !== snapshotId || typeof metadata.deviceId !== 'string' ||
        !Number.isSafeInteger(metadata.chunkCount) || metadata.chunkCount < 1 || metadata.chunkCount > 20 ||
        !Number.isSafeInteger(metadata.ciphertextBytes) || metadata.ciphertextBytes < 16 ||
        metadata.ciphertextBytes > MAX_CIPHERTEXT_BYTES) throw new Error('来源快照校验失败。');
      return authenticatedSnapshot(metadata, pairing, metadata.deviceId);
    }

    async function prepareSource(snapshotId, type) {
      if (typeof snapshotId !== 'string' || !snapshotId.trim()) throw new Error('请明确选择一个来源快照。');
      await assertNoOtherPending(type, snapshotId);
      await assertNoRollback();
      await preflight({ type: type, snapshotId: snapshotId });
      var pairing = await requirePairing();
      var metadata = await readSource(snapshotId, pairing);
      var devices = (await dashboard(pairing)).devices;
      var sourceDevice = devices.find(function (device) { return device.deviceId === metadata.deviceId; });
      var currentDevice = devices.find(function (device) { return device.deviceId === pairing.deviceId; });
      if (!sourceDevice || !currentDevice || currentDevice.revoked) throw new Error('来源或当前设备不可用。');
      if (type === 'restore' && (metadata.deviceId !== pairing.deviceId ||
        !sourceDevice.historySnapshots.some(function (item) { return item.snapshotId === snapshotId; }))) {
        throw new Error('请选择当前设备的历史快照。');
      }
      var chunks = [], total = 0;
      for (var index = 0; index < metadata.chunkCount; index += 1) {
        var chunk = await authenticatedCall('getChunk', [snapshotId, index, { withDigest: true }], pairing);
        if (!chunk || !(chunk.bytes instanceof ArrayBuffer) || typeof chunk.digest !== 'string') throw new Error('密文分块校验失败。');
        var bytes = new Uint8Array(chunk.bytes);
        total += bytes.length;
        if (!bytes.length || bytes.length > 524288 || total > metadata.ciphertextBytes) throw new Error('密文分块校验失败。');
        chunks.push({ index: index, byteLength: bytes.length, data: encode(bytes), digest: chunk.digest });
      }
      if (total !== metadata.ciphertextBytes) throw new Error('密文分块校验失败。');
      var ciphertext = await cryptoApi().joinAndVerifyChunks(chunks, metadata.ciphertextDigest);
      var envelope = await core().validateSnapshotEnvelope(await cryptoApi().decryptSnapshot({
        version: 1, algorithm: 'AES-256-GCM', encoding: metadata.encoding, iv: metadata.iv, ciphertext: encode(ciphertext)
      }, pairing.masterKey, Object.assign({}, metadata, { spaceId: pairing.spaceId, sourceDeviceId: metadata.deviceId })));
      if (envelope.schemaVersion !== metadata.schemaVersion) throw new Error('来源快照校验失败。');
      var preview = Object.freeze({ type: type, snapshotId: snapshotId, sourceDeviceName: sourceDevice.deviceName,
        currentDeviceName: currentDevice.deviceName, serverCreatedAt: metadata.serverCreatedAt,
        appVersion: envelope.appVersion, itemCount: Object.keys(envelope.data).length,
        byteSize: new TextEncoder().encode(core().canonicalStringify(envelope.data)).length,
        confirmationText: sourceDevice.deviceName + ' → ' + currentDevice.deviceName + '\n当前设备全部个人数据将被覆盖',
        handle: Object.freeze({}) });
      preparedPulls.set(preview, { envelope: envelope, metadata: metadata, spaceId: pairing.spaceId,
        deviceId: pairing.deviceId, cancelled: false, replacing: false });
      return preview;
    }

    async function stageReplacement(data, pairing, operation, sourceSnapshotId) {
      var envelope = await core().createSnapshotEnvelope({ appVersion: version(), sourceDeviceId: pairing.deviceId,
        clientCreatedAt: now(), data: data });
      var snapshotId = uuid();
      var record = await cryptoApi().encryptSnapshot(envelope, pairing.masterKey,
        Object.assign({}, envelope, { spaceId: pairing.spaceId, snapshotId: snapshotId }));
      var bytes = decode(record.ciphertext);
      if (bytes.length > MAX_CIPHERTEXT_BYTES) throw new Error('快照密文不能超过 10 MiB。');
      var chunks = await cryptoApi().chunkCiphertext(bytes);
      var body = { operation: operation, snapshotId: snapshotId, sourceSnapshotId: sourceSnapshotId,
        appVersion: envelope.appVersion, formatVersion: envelope.formatVersion, schemaVersion: envelope.schemaVersion,
        encoding: record.encoding, clientCreatedAt: envelope.clientCreatedAt, dataHash: envelope.dataHash, iv: record.iv,
        ciphertextBytes: chunks.byteLength, chunkCount: chunks.chunks.length, ciphertextDigest: chunks.digest };
      body.encryptedSummary = await encryptMetadata({ dataHash: envelope.dataHash }, pairing.masterKey, 'snapshot-summary',
        summaryContext(pairing.spaceId, pairing.deviceId, body));
      var operationId = uuid();
      var session = await authenticatedCall('createUpload', [body, operationId], pairing);
      if (!session || session.snapshotId !== snapshotId || typeof session.uploadId !== 'string' ||
        !Array.isArray(session.uploadedChunks)) throw new Error('上传会话响应不正确。');
      for (var chunk of chunks.chunks) {
        if (session.uploadedChunks.indexOf(chunk.index) === -1) await authenticatedCall('putChunk', [session.uploadId, chunk.index, decode(chunk.data), chunk.digest], pairing);
      }
      return { uploadId: session.uploadId, snapshotId: snapshotId, operationId: operationId };
    }

    async function confirmPull(preview) {
      return exclusive(async function () {
        if (pendingUpload || pendingEnrollment) throw new Error('请先处理已有同步操作。');
        var prepared = preview && preparedPulls.get(preview);
        if (!prepared || prepared.cancelled) throw new Error('来源确认已失效，请重新选择快照。');
        await assertNoOtherPending(preview.type, preview.snapshotId);
        await assertNoRollback();
        await preflight({ type: preview.type, snapshotId: preview.snapshotId });
        var pairing = await requirePairing();
        if (pairing.spaceId !== prepared.spaceId || pairing.deviceId !== prepared.deviceId) throw new Error('来源确认与当前配对不匹配。');
        var metadata = await readSource(preview.snapshotId, pairing);
        if (core().canonicalStringify(metadata) !== core().canonicalStringify(prepared.metadata)) throw new Error('来源快照已变化，请重新确认。');
        if (prepared.cancelled) throw new Error('已取消覆盖。');
        var settings = dependency('settings', 'QinshiSettings');
        var before = (await core().createSnapshotEnvelope({ appVersion: version(), sourceDeviceId: pairing.deviceId,
          clientCreatedAt: now(), data: settings.collectManagedData() })).data;
        prepared.ownerId = uuid();
        // Claim before the browser download: a competing tab must have no backup
        // or write side effects even if it passed the earlier read-only precheck.
        await storage().claimRollbackCopy({ ownerId: prepared.ownerId, createdAt: now(), data: before });
        var backupDownloadFailed = false;
        var replacementStarted = false;
        var cloudCommitted = false, cleared = false, lease = null;
        try {
          await storage().savePendingOperation({ type: preview.type, snapshotId: preview.snapshotId });
          try {
            var payload = settings.makePayload('before-cloud-sync');
            payload.data = before; // Back up exactly the owned rollback image.
            await settings.downloadPayload(payload, 'before-cloud-sync');
          } catch (downloadError) { backupDownloadFailed = true; }
          var prefix = preview.type === 'restore' ? 'restore' : 'replace';
          var stagedBefore = await stageReplacement(before, pairing, prefix + '-before', null);
          var stagedAfter = await stageReplacement(prepared.envelope.data, pairing, prefix + '-after', preview.snapshotId);
          if (prepared.cancelled) throw new Error('已取消覆盖。');
          lease = await startWriteLease(prepared.ownerId);
          var writePermit = await lease.renew();
          if (prepared.cancelled) throw new Error('已取消覆盖。');
          // Fail closed if local editing continued while encryption/network was pending.
          if (core().canonicalStringify(settings.collectManagedData()) !== core().canonicalStringify(before)) throw new Error('本机数据已变化，请处理回滚副本后重新确认。');
          requireLeaseWindow(writePermit.writeLeaseUntil);
          prepared.replacing = true;
          replacementStarted = true;
          settings.replaceManagedData(prepared.envelope.data);
          var committed = await authenticatedCall('commitUpload', [stagedAfter.uploadId,
            { beforeUploadId: stagedBefore.uploadId, sourceSnapshotId: preview.snapshotId }, stagedAfter.operationId], pairing);
          if (!committed || committed.operationId !== stagedAfter.uploadId || committed.latestSnapshotId !== stagedAfter.snapshotId ||
            !Array.isArray(committed.historySnapshotIds) || committed.historySnapshotIds[0] !== stagedBefore.snapshotId) throw new Error('云端提交响应不正确。');
          // Acknowledged cloud replacement must fence automatic local rollback
          // before any fallible lease renewal or cleanup can enter the catch path.
          cloudCommitted = true;
          var committedPermit = await lease.renew();
          requireLeaseWindow(committedPermit.writeLeaseUntil);
          await storage().clearPendingOperation();
          var clearPermit = await lease.renew();
          requireLeaseWindow(clearPermit.writeLeaseUntil);
          // Conditional clear is the terminal IDB fence. No local data writes or
          // asynchronous work may follow successful removal of the rollback record.
          await storage().clearRollbackCopy(prepared.ownerId, undefined, lease.fenceId);
          cleared = true;
          lease.stop();
          dependency('location', 'location').reload();
          return { status: 'replaced', snapshotId: stagedAfter.snapshotId, backupDownloadFailed: backupDownloadFailed };
        } catch (error) {
          if (replacementStarted && !cloudCommitted) {
            var rollback = await lease.renew();
            requireLeaseWindow(rollback.writeLeaseUntil);
            try { settings.restoreManagedData(rollback.data); }
            catch (restoreError) { throw new Error('覆盖失败且本机自动恢复失败，请使用保留的回滚副本恢复覆盖前数据。'); }
          }
          throw error;
        } finally {
          preparedPulls.delete(preview);
          if (lease) {
            lease.stop();
            if (!cleared) {
              try { await storage().releaseRollbackWrite(prepared.ownerId, lease.fenceId); }
              catch (releaseError) { /* A stale token must not release newer ownership. */ }
            }
          }
        }
      });
    }

    async function recovery(action) {
      if (action !== undefined && action !== 'restore' && action !== 'discard') throw new Error('请明确选择回滚恢复方式。');
      var copy = await storage().loadRollbackCopy();
      if (!copy) return { status: 'idle' };
      var actionId;
      if (action !== undefined) {
        actionId = uuid();
        copy = await storage().acquireRollbackRecovery(copy.ownerId, actionId);
      }
      var settings = dependency('settings', 'QinshiSettings');
      // Use the core's allowlist/schema validation even when IndexedDB was tampered with.
      var saved = await core().createSnapshotEnvelope({ appVersion: version(), sourceDeviceId: 'rollback-recovery',
        clientCreatedAt: copy.createdAt, data: copy.data });
      if (action === undefined) return { status: 'recovery-required', createdAt: copy.createdAt,
        matchesCurrent: core().canonicalStringify(settings.collectManagedData()) === core().canonicalStringify(saved.data),
        actions: ['恢复覆盖前数据', '保留当前数据并删除回滚副本'] };
      var renewed = await storage().renewRollbackRecovery(copy.ownerId, actionId);
      // A suspended page can resume after the IDB result's lease has expired.
      // Require a fresh 30-second write budget, then do not await before the
      // bounded synchronous local transaction (managed data is capped at 10 MiB).
      requireLeaseWindow(renewed.recoveryLeaseUntil);
      if (action === 'restore') settings.replaceManagedData(saved.data);
      await storage().clearPendingOperation();
      await storage().clearRollbackCopy(copy.ownerId, actionId);
      preparedPulls = new WeakMap();
      if (action === 'restore') dependency('location', 'location').reload();
      return { status: action === 'restore' ? 'recovered' : 'discarded' };
    }

    async function resumePendingOperation() {
      return exclusive(async function () {
        var interrupted = await recovery();
        if (interrupted.status !== 'idle') return interrupted;
        if (pendingSecurity) {
          await preflight();
          return finishSecurity(pendingSecurity);
        }
        if (pendingEnrollment) {
          await preflight();
          return finishEnrollment(pendingEnrollment);
        }
        if (pendingUpload) return uploadCurrent();
        var pending = await storage().loadPendingOperation();
        if (!pending) return { status: 'idle' };
        // A reload intentionally retains no ciphertext or secrets in sessionStorage.
        // Manual upload will compare cloud latest before creating a new operation.
        if (pending.type === 'upload') return { status: 'manual-upload-required', snapshotId: pending.snapshotId };
        if (pending.type === 'pull' || pending.type === 'restore') {
          return { status: 'confirmation-required', preview: await prepareSource(pending.snapshotId, pending.type) };
        }
        return { status: 'pending', operation: pending };
      });
    }

    async function assertSecurityIdle() {
      await assertNoOtherPending();
      await assertNoRollback();
    }

    async function assertSamePairing(pairing) {
      var current = await storage().loadPairing();
      if (!current || current.spaceId !== pairing.spaceId || current.deviceId !== pairing.deviceId ||
        current.deviceToken !== pairing.deviceToken) throw new Error('安全操作与当前配对不匹配。');
    }

    async function renameDevice(id, value) {
      return exclusive(async function () {
        await assertSecurityIdle();
        if (typeof id !== 'string' || !id) throw new Error('请选择设备。');
        if (typeof value !== 'string') throw new Error('设备名称不正确。');
        var name = deviceName(value);
        await preflight();
        var pairing = await requirePairing();
        var encryptedName = await encryptMetadata({ deviceName: name }, pairing.masterKey, 'device-name', nameContext(pairing.spaceId, id));
        await assertSecurityIdle();
        await assertSamePairing(pairing);
        var response = await authenticatedCall('renameDevice', [id, { encryptedName: encryptedName }], pairing);
        if (!response || response.deviceId !== id || core().canonicalStringify(response.encryptedName) !== core().canonicalStringify(encryptedName)) throw new Error('设备重命名响应不正确。');
        if (id === pairing.deviceId) {
          await assertSamePairing(pairing);
          await storage().replacePairingIfCurrent(pairing, Object.assign({}, pairing, { deviceName: name }));
        }
        return { status: 'renamed', deviceId: id };
      });
    }

    async function revokeDevice(id, deleteSnapshots) {
      return exclusive(async function () {
        await assertSecurityIdle();
        if (typeof deleteSnapshots !== 'boolean') throw new Error('请明确选择保留或删除该设备快照。');
        if (typeof options.confirmRevokeDevice !== 'function') throw new Error('请确认撤销设备。');
        await preflight();
        var pairing = await requirePairing();
        var target = (await dashboard(pairing)).devices.find(function (device) { return device.deviceId === id; });
        if (!target) throw new Error('请选择有效设备。');
        var confirmed = await options.confirmRevokeDevice(Object.freeze({ deviceId: id, deviceName: target.deviceName,
          deleteSnapshots: deleteSnapshots, choices: Object.freeze(['保留该设备快照', '同时删除该设备快照']) }));
        if (confirmed !== true) throw new Error('已取消撤销设备。');
        await assertSecurityIdle();
        await assertSamePairing(pairing);
        await authenticatedCall('revokeDevice', [id, { deleteSnapshots: deleteSnapshots }], pairing);
        if (id === pairing.deviceId) {
          await assertSecurityIdle();
          await assertSamePairing(pairing);
          await storage().forgetPairingIfCurrent(pairing);
        }
        preparedPulls = new WeakMap();
        return { status: 'revoked', deviceId: id, deleteSnapshots: deleteSnapshots };
      });
    }

    function requireNewPassword(input) {
      if (!input || typeof input.newPassword !== 'string' || !input.newPassword || input.newPassword !== input.confirmPassword) throw new Error('两次输入的新密码必须一致且不能为空。');
    }

    async function securityParameters(input, pairing) {
      var code = normalizeSyncCode(input.syncCode);
      var params = await api().getParameters(code);
      core().assertVersionAllowed(version(), params, 'write');
      if (pairing && params.spaceId !== pairing.spaceId) throw new Error('同步码与当前配对不匹配。');
      return { code: code, params: params };
    }

    async function freshAuthenticator(secret, params, pairing, recovery) {
      if (typeof secret !== 'string' || !secret) throw new Error(recovery ? '请输入恢复密钥。' : '请输入当前同步密码。');
      var keys = recovery
        ? await cryptoApi().deriveRecoveryKeys(await cryptoApi().parseRecoveryKey(secret), params.kdf.salt)
        : await cryptoApi().derivePasswordKeys(secret, params.kdf);
      var masterKey = await cryptoApi().unwrapMasterKey(recovery ? params.recoveryWrappedMaster : params.passwordWrappedMaster,
        keys.wrappingKey, params.spaceId);
      if (pairing && masterKey !== pairing.masterKey) throw new Error('凭据与当前配对主密钥不匹配。');
      return { authKey: keys.authKey, masterKey: masterKey };
    }

    async function newRecovery(input, code, params, masterKey) {
      var confirm = input.confirmRecoveryCredentials || options.confirmRecoveryCredentials;
      if (typeof confirm !== 'function') throw new Error('请先提供恢复密钥保存确认。');
      var recovery = await cryptoApi().generateRecoveryKey();
      var keys = await cryptoApi().deriveRecoveryKeys(recovery.recoveryKey, params.kdf.salt);
      var wrapped = await cryptoApi().wrapMasterKey(masterKey, keys.wrappingKey, params.spaceId);
      var acknowledged = await confirm(Object.freeze({ syncCode: code, recoveryKey: recovery.displayKey }));
      if (acknowledged !== true) throw new Error('请确认已保存恢复密钥。');
      return { newRecoveryAuthKey: keys.authKey, newRecoveryWrappedMaster: wrapped };
    }

    async function assertSecurityContext(pending) {
      if (await storage().loadPendingOperation()) throw new Error('请先处理已有同步操作。');
      await assertNoRollback();
      var current = await storage().loadPairing();
      if ((current && (!pending.pairing || current.spaceId !== pending.pairing.spaceId ||
        current.deviceId !== pending.pairing.deviceId || current.deviceToken !== pending.pairing.deviceToken)) ||
        (!current && pending.pairing && !pending.acknowledged && pending.method !== 'recover' &&
          !(pending.method === 'deleteSpace' && pending.sent))) throw new Error('安全操作与当前配对不匹配。');
      return current;
    }

    function definitiveSecurityFailure(error) {
      if (!error || error.retryable === true) return false;
      if (error.status >= 400 && error.status < 500 && error.status !== 408) return true;
      // These safe API failures occur before fetch. Invalid/missing response and
      // network/service errors may follow a commit and must retain the proof.
      return ['PAIRING_REQUIRED', 'SYNC_NOT_CONFIGURED', 'INVALID_REQUEST', 'UPGRADE_REQUIRED'].indexOf(error.code) !== -1;
    }

    async function finishSecurity(pending) {
      try {
        // Recheck durable fences after user interaction, retries and server waits.
        await assertSecurityContext(pending);
        if (!pending.acknowledged) {
          var transport = api();
          if (typeof transport[pending.method] !== 'function') throw new Error('云同步安全操作依赖不可用。');
          var replay = pending.sent && pending.pairing ? { pairing: pending.pairing } : undefined;
          pending.sent = true;
          pending.response = pending.method === 'recover'
            ? await transport.recover(pending.code, pending.body, pending.operationId)
            : await authenticatedCall(pending.method, [pending.body, pending.operationId, replay], pending.pairing);
          if (pending.method !== 'deleteSpace') {
            var expectedId = pending.device ? pending.device.deviceId : pending.pairing.deviceId;
            if (!pending.response || pending.response.spaceId !== pending.spaceId || pending.response.deviceId !== expectedId) throw new Error('安全操作响应不正确。');
            core().assertVersionAllowed(version(), pending.response, 'write');
          }
          pending.acknowledged = true;
        }
        var current = await assertSecurityContext(pending);
        if (pending.method === 'recover') await savePairing(pending.response, pending.spaceId, pending.device, pending.name, pending.masterKey, current);
        if (pending.method === 'deleteSpace') await storage().forgetPairingIfCurrent(pending.pairing, { allowAbsent: true });
        pendingSecurity = null;
        preparedPulls = new WeakMap();
        return { status: pending.method === 'recover' ? 'password-reset' : pending.method === 'deleteSpace' ? 'deleted' :
          pending.method === 'changePassword' ? 'password-changed' : 'recovery-key-rotated' };
      } catch (error) {
        if (!pending.sent || (!pending.acknowledged && definitiveSecurityFailure(error))) pendingSecurity = null;
        throw error;
      }
    }

    async function securityOperation(method, input) {
      return exclusive(async function () {
        await assertSecurityIdle();
        if (!input && method === 'rotateRecoveryKey' && typeof options.requestSecurityCredentials === 'function') {
          input = await options.requestSecurityCredentials(Object.freeze({ operation: method }));
        }
        input = input || {};
        if (method === 'changePassword' || method === 'recover') requireNewPassword(input);
        var pairing = method === 'recover' ? await storage().loadPairing() : await requirePairing();
        var useRecovery = method === 'recover' || (method === 'deleteSpace' && input.recoveryKey !== undefined);
        if (method === 'deleteSpace' && input.recoveryKey !== undefined && input.password !== undefined) throw new Error('请仅提供密码或恢复密钥中的一种。');
        await preflight();
        var lookup = await securityParameters(input, pairing);
        var params = lookup.params;
        var authenticated = await freshAuthenticator(useRecovery ? input.recoveryKey :
          (method === 'changePassword' ? input.currentPassword : input.password), params, pairing, useRecovery);
        var body = { appVersion: version() };
        body[useRecovery ? 'recoveryAuthKey' : 'authKey'] = authenticated.authKey;
        if (method === 'changePassword' || method === 'recover') {
          var keys = await cryptoApi().derivePasswordKeys(input.newPassword, params.kdf);
          body.newAuthKey = keys.authKey;
          body.newPasswordWrappedMaster = await cryptoApi().wrapMasterKey(authenticated.masterKey, keys.wrappingKey, params.spaceId);
        }
        if (method === 'rotateRecoveryKey' || method === 'recover') {
          Object.assign(body, await newRecovery(input, lookup.code, params, authenticated.masterKey));
        }
        var device, name;
        if (method === 'recover') {
          name = deviceName(input.deviceName);
          device = await localDevice(name, params.spaceId, authenticated.masterKey);
          body.device = device;
        }
        if (method === 'deleteSpace') {
          var confirm = input.confirmDeleteSpace || options.confirmDeleteSpace;
          if (typeof confirm !== 'function' || await confirm(Object.freeze({ spaceId: params.spaceId,
            confirmationText: '永久删除同步空间' })) !== '永久删除同步空间') throw new Error('请再次准确输入确认文字：永久删除同步空间。');
          body.confirmation = '永久删除同步空间';
        }
        await assertSecurityIdle();
        pendingSecurity = { method: method, operationId: uuid(), code: lookup.code, spaceId: params.spaceId,
          pairing: pairing, body: body, device: device, name: name, masterKey: method === 'recover' ? authenticated.masterKey : undefined };
        return finishSecurity(pendingSecurity);
      });
    }

    return {
      createSpace: createSpace, joinSpace: joinSpace,
      uploadCurrentDevice: function () { return exclusive(uploadCurrent); },
      getDashboard: getDashboard,
      renameDevice: renameDevice, revokeDevice: revokeDevice,
      changePassword: function (input) { return securityOperation('changePassword', input); },
      rotateRecoveryKey: function (input) { return securityOperation('rotateRecoveryKey', input); },
      resetPasswordWithRecovery: function (input) { return securityOperation('recover', input); },
      deleteSpace: function (input) { return securityOperation('deleteSpace', input); },
      preparePull: function (snapshotId) { return exclusive(function () { return prepareSource(snapshotId, 'pull'); }); },
      restoreHistory: function (snapshotId) { return exclusive(function () { return prepareSource(snapshotId, 'restore'); }); },
      confirmPull: confirmPull,
      cancelPull: function (preview) {
        var prepared = preview && preparedPulls.get(preview);
        if (!prepared || prepared.replacing) return false;
        prepared.cancelled = true;
        return true;
      },
      recoverInterruptedRollback: function (action) { return exclusive(function () { return recovery(action); }); },
      forgetCurrentDevice: function () { return exclusive(async function () {
        await assertSecurityIdle();
        await storage().forgetPairingIfCurrent(await storage().loadPairing());
        pendingUpload = null; pendingEnrollment = null;
      }); },
      resumePendingOperation: resumePendingOperation,
      detectDeviceName: detectDeviceName, normalizeSyncCode: normalizeSyncCode
    };
  }

  var confirmRevokeDevice = null;
  var sync = createSync({
    confirmRevokeDevice: function (detail) {
      return confirmRevokeDevice ? confirmRevokeDevice(detail) : false;
    }
  });

  function bindSettingsUI(syncClient, doc) {
    var panel = doc.getElementById('cloud-sync-panel');
    if (!panel) return null;
    var state = createSettingsState();
    var configured = Boolean(root.QinshiCloudSyncConfig && root.QinshiCloudSyncConfig.enabled === true &&
      typeof root.QinshiCloudSyncConfig.apiBaseUrl === 'string' && /^https:\/\//.test(root.QinshiCloudSyncConfig.apiBaseUrl));
    var lastResult = '尚无同步操作';
    var replacing = false;

    function element(id) { return doc.getElementById(id); }
    function setText(id, value) { var target = element(id); if (target) target.textContent = value == null ? '' : String(value); }
    function formatDate(value) {
      if (!value) return '未知时间';
      var date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
    }
    function formatBytes(value) {
      if (!Number.isFinite(value) || value < 0) return '未知大小';
      if (value < 1024) return value + ' B';
      if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KiB';
      return (value / (1024 * 1024)).toFixed(1) + ' MiB';
    }
    function status(message, error) {
      var target = element('cloud-sync-status');
      target.textContent = message || '';
      target.classList.toggle('error-text', error === true);
    }
    function setProgress(message, active) {
      var target = element('cloud-sync-progress');
      target.hidden = !active;
      target.querySelector('span').textContent = message || '';
      var progress = target.querySelector('progress');
      if (active) progress.removeAttribute('value');
      else progress.value = 0;
    }
    function renderActionState() {
      panel.querySelectorAll('[data-cloud-action]').forEach(function (button) {
        button.disabled = !configured || state.writeInFlight();
      });
      element('cloud-sync-prepare').disabled = !configured || state.writeInFlight() || !state.selectedSource();
      element('cloud-sync-confirm-overwrite').disabled = !configured || !state.canConfirmOverwrite();
      element('cloud-sync-cancel-overwrite').disabled = replacing;
    }
    function appendLine(parent, className, text) {
      var line = doc.createElement('span');
      line.className = className;
      line.textContent = text;
      parent.appendChild(line);
      return line;
    }
    function snapshotCard(item) {
      var label = doc.createElement('label');
      label.className = 'cloud-sync-source-card';
      var radio = doc.createElement('input');
      radio.type = 'radio';
      radio.name = 'cloud-sync-source';
      radio.value = item.snapshot.snapshotId;
      radio.addEventListener('change', function () {
        state.selectSource(radio.value);
        renderActionState();
      });
      label.appendChild(radio);
      var body = doc.createElement('span');
      body.className = 'cloud-sync-card-body';
      appendLine(body, 'cloud-sync-card-title', item.device.deviceName);
      appendLine(body, 'cloud-sync-card-meta', item.badge + ' · ' + formatDate(item.snapshot.serverCreatedAt));
      appendLine(body, 'cloud-sync-card-meta', '工具 ' + (item.snapshot.appVersion || '未知') + ' · ' + formatBytes(item.snapshot.ciphertextBytes));
      label.appendChild(body);
      return label;
    }
    function renderDashboard(dashboard) {
      state.setDashboard(dashboard);
      element('cloud-sync-unbound').hidden = dashboard.paired === true;
      element('cloud-sync-paired').hidden = dashboard.paired !== true;
      if (dashboard.paired !== true) { renderActionState(); return; }
      var current = dashboard.devices.find(function (device) { return device.deviceId === dashboard.deviceId; });
      setText('cloud-sync-current-device', dashboard.deviceName || (current && current.deviceName) || '当前设备');
      setText('cloud-sync-tool-version', root.QinshiPWA && root.QinshiPWA.version || '未知');
      setText('cloud-sync-cloud-state', configured ? '已连接' : '服务未配置');
      setText('cloud-sync-last-upload', current && current.lastUploadedAt ? formatDate(current.lastUploadedAt) : '尚未上传');
      setText('cloud-sync-last-result', lastResult);

      var sources = element('cloud-sync-source-list');
      sources.replaceChildren();
      state.sources().forEach(function (item) { sources.appendChild(snapshotCard(item)); });
      if (!state.sources().length) appendLine(sources, 'muted-tip', '暂无其他设备快照。');

      var histories = element('cloud-sync-history-list');
      histories.replaceChildren();
      state.currentHistory().forEach(function (snapshot) {
        var card = doc.createElement('article');
        card.className = 'cloud-sync-history-card';
        appendLine(card, 'cloud-sync-card-title', '本设备历史');
        appendLine(card, 'cloud-sync-card-meta', formatDate(snapshot.serverCreatedAt) + ' · 工具 ' + (snapshot.appVersion || '未知'));
        appendLine(card, 'cloud-sync-card-meta', formatBytes(snapshot.ciphertextBytes));
        var button = doc.createElement('button');
        button.type = 'button';
        button.className = 'seg cloud-sync-action';
        button.textContent = '恢复此历史';
        button.dataset.cloudAction = '';
        button.addEventListener('click', function () {
          run('正在读取历史快照…', async function () {
            var preview = await syncClient.restoreHistory(snapshot.snapshotId);
            showOverwrite(preview);
            return preview;
          }, '已读取历史快照，请核对覆盖方向。', false);
        });
        card.appendChild(button);
        histories.appendChild(card);
      });
      if (!state.currentHistory().length) appendLine(histories, 'muted-tip', '本设备暂无可恢复历史。');

      var select = element('cloud-sync-device-select');
      select.replaceChildren();
      dashboard.devices.forEach(function (device) {
        var option = doc.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.deviceName + (device.current ? '（当前设备）' : '') + (device.revoked ? '（已撤销）' : '');
        select.appendChild(option);
      });
      if (select.options.length) {
        var selectedDevice = dashboard.devices.find(function (device) { return device.deviceId === select.value; });
        element('cloud-sync-rename-value').value = selectedDevice ? selectedDevice.deviceName : '';
      }
      renderActionState();
    }
    async function refreshDashboard() {
      var dashboard;
      if (!configured && root.QinshiCloudSyncStorage) {
        var pairing = await root.QinshiCloudSyncStorage.loadPairing();
        dashboard = pairing ? { paired: true, deviceId: pairing.deviceId, deviceName: pairing.deviceName,
          devices: [{ deviceId: pairing.deviceId, deviceName: pairing.deviceName, current: true,
            revoked: false, latestSnapshot: null, historySnapshots: [] }] } : { paired: false, devices: [] };
      } else dashboard = await syncClient.getDashboard();
      renderDashboard(dashboard);
      return dashboard;
    }
    function clearSecrets(form) {
      form.querySelectorAll('input[type="password"]').forEach(function (input) { input.value = ''; });
    }
    function values(form) {
      var result = {};
      new root.FormData(form).forEach(function (value, key) { result[key] = String(value); });
      return result;
    }
    function run(progressText, action, successText, refreshAfter) {
      if (!configured) {
        status('云同步服务尚未配置，本机数据和 JSON 备份不受影响。', true);
        return Promise.resolve(false);
      }
      return state.withWriteLock(async function () {
        setProgress(progressText, true);
        status(progressText, false);
        try {
          var result = await action();
          lastResult = typeof successText === 'function' ? successText(result) : successText;
          status(lastResult, false);
          if (refreshAfter !== false) await refreshDashboard();
          return result;
        } catch (error) {
          lastResult = '操作失败';
          status('操作失败：' + (error && error.message ? error.message : '未知错误'), true);
          try { await refreshDashboard(); } catch (refreshError) { /* Keep the actionable operation error. */ }
          return null;
        } finally {
          setProgress('', false);
        }
      }, renderActionState);
    }
    function downloadRecovery(credentials) {
      var text = 'Qin 跨设备数据同步凭据\n\n同步码：' + credentials.syncCode + '\n恢复密钥：' + credentials.recoveryKey +
        '\n\n请离线妥善保存。任何人取得这些信息都可能尝试访问您的同步空间。\n';
      var url = root.URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      var anchor = doc.createElement('a');
      anchor.href = url;
      anchor.download = 'Qin-云同步恢复凭据.txt';
      anchor.click();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
    }
    function showRecovery(credentials) {
      state.setRecoveryAcknowledged(false);
      setText('cloud-sync-recovery-code', credentials.syncCode);
      setText('cloud-sync-recovery-key', credentials.recoveryKey);
      var layer = element('cloud-sync-recovery-layer');
      var checkbox = element('cloud-sync-recovery-ack');
      var confirm = element('cloud-sync-recovery-confirm');
      checkbox.checked = false;
      confirm.disabled = true;
      layer.hidden = false;
      layer.querySelector('[role="dialog"]').focus();
      element('cloud-sync-recovery-download').onclick = function () { downloadRecovery(credentials); };
      checkbox.onchange = function () {
        state.setRecoveryAcknowledged(checkbox.checked);
        confirm.disabled = !state.canDismissRecovery();
      };
      return new Promise(function (resolve) {
        confirm.onclick = function () {
          if (!state.canDismissRecovery()) return;
          layer.hidden = true;
          setText('cloud-sync-recovery-code', '');
          setText('cloud-sync-recovery-key', '');
          confirm.onclick = null;
          resolve(true);
        };
      });
    }
    function showOverwrite(preview) {
      state.setPreview(preview);
      replacing = false;
      setText('cloud-sync-direction', preview.sourceDeviceName + ' → ' + preview.currentDeviceName);
      var summary = element('cloud-sync-confirm-summary');
      summary.replaceChildren();
      [['来源时间', formatDate(preview.serverCreatedAt)], ['快照工具版本', preview.appVersion],
        ['数据摘要', preview.itemCount + ' 项 · ' + formatBytes(preview.byteSize)]].forEach(function (row) {
        var term = doc.createElement('dt'); term.textContent = row[0];
        var detail = doc.createElement('dd'); detail.textContent = row[1];
        summary.appendChild(term); summary.appendChild(detail);
      });
      element('cloud-sync-confirm-check').checked = false;
      element('cloud-sync-confirm-layer').hidden = false;
      element('cloud-sync-confirm-layer').querySelector('[role="dialog"]').focus();
      renderActionState();
    }
    async function resumePending() {
      if (!configured) return;
      await state.withWriteLock(async function () {
        try {
          var pending = await syncClient.resumePendingOperation();
          if (!pending || pending.status === 'idle') return;
          if (pending.status === 'confirmation-required') {
            showOverwrite(pending.preview);
            status('工具已更新，请重新核对来源和目标后确认覆盖。', false);
          } else if (pending.status === 'recovery-required') {
            element('cloud-sync-rollback').hidden = false;
            setText('cloud-sync-rollback-detail', '副本时间：' + formatDate(pending.createdAt) +
              (pending.matchesCurrent ? '；当前数据与回滚副本一致。' : '；当前数据与回滚副本不同。'));
            status('请先明确处理上次同步留下的回滚副本。', true);
          } else if (pending.status === 'manual-upload-required') {
            status('检测到未完成的本机上传，请点击“上传本机快照”继续。', false);
          } else {
            lastResult = '上次同步操作已安全恢复。';
            status(lastResult, false);
            await refreshDashboard();
          }
        } catch (error) {
          status('恢复上次同步操作失败：' + (error && error.message ? error.message : '未知错误'), true);
        }
      }, renderActionState);
    }

    confirmRevokeDevice = function (detail) {
      var handling = detail.deleteSnapshots ? '同时删除该设备的最新版和历史快照' : '保留该设备的云端快照';
      return Promise.resolve(root.confirm('确认撤销设备“' + detail.deviceName + '”？\n' + handling + '。'));
    };
    element('cloud-sync-config-notice').hidden = configured;
    element('cloud-sync-create-device').value = syncClient.detectDeviceName();
    element('cloud-sync-join-device').value = syncClient.detectDeviceName();
    element('cloud-sync-reset-device').value = syncClient.detectDeviceName();
    panel.querySelectorAll('[data-secret-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = element(button.dataset.secretTarget);
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.textContent = visible ? '显示' : '隐藏';
        button.setAttribute('aria-label', (visible ? '显示' : '隐藏') + button.getAttribute('aria-label').replace(/^(显示|隐藏)/, ''));
      });
    });
    element('cloud-sync-create-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form);
      clearSecrets(form);
      input.confirmRecoveryCredentials = showRecovery;
      run('正在创建同步空间并上传本机快照…', function () { return syncClient.createSpace(input); }, '同步空间已创建，本机快照已上传。');
    });
    element('cloud-sync-join-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form);
      clearSecrets(form);
      run('正在加入同步空间…', function () { return syncClient.joinSpace(input); }, '已加入同步空间；尚未上传或覆盖任何数据。');
    });
    element('cloud-sync-reset-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form);
      clearSecrets(form);
      input.confirmRecoveryCredentials = showRecovery;
      run('正在用恢复密钥重设密码并撤销旧设备…', function () { return syncClient.resetPasswordWithRecovery(input); },
        '同步密码已重设，全部旧设备凭据已撤销；本设备已重新绑定。');
    });
    element('cloud-sync-upload').addEventListener('click', function () {
      run('正在生成并上传本机快照…', function () { return syncClient.uploadCurrentDevice(); }, function (result) {
        return result && result.status === 'unchanged' ? '本机数据无变化。' : '本机快照上传完成。';
      });
    });
    element('cloud-sync-refresh').addEventListener('click', function () {
      run('正在刷新设备列表…', refreshDashboard, '设备列表已刷新。', false);
    });
    element('cloud-sync-prepare').addEventListener('click', function () {
      var source = state.selectedSource();
      if (!source) return;
      run('正在读取所选来源快照…', async function () {
        var preview = await syncClient.preparePull(source.snapshot.snapshotId);
        showOverwrite(preview);
        return preview;
      }, '已读取来源快照，请核对覆盖方向。', false);
    });
    element('cloud-sync-confirm-check').addEventListener('change', function (event) {
      state.setOverwriteConfirmed(event.currentTarget.checked);
      renderActionState();
    });
    element('cloud-sync-cancel-overwrite').addEventListener('click', function () {
      var preview = state.preview();
      if (!preview || replacing) return;
      syncClient.cancelPull(preview);
      state.setPreview(null);
      element('cloud-sync-confirm-layer').hidden = true;
      status('已取消覆盖，当前设备数据未更改。', false);
      element('cloud-sync-prepare').focus();
      renderActionState();
    });
    element('cloud-sync-confirm-overwrite').addEventListener('click', function () {
      if (!state.canConfirmOverwrite()) return;
      var preview = state.preview();
      replacing = true;
      renderActionState();
      run('正在备份并覆盖当前设备，请勿关闭页面…', function () { return syncClient.confirmPull(preview); },
        '覆盖同步完成，工具即将重新载入。', false).finally(function () {
          replacing = false;
          state.setPreview(null);
          element('cloud-sync-confirm-layer').hidden = true;
          renderActionState();
        });
    });
    element('cloud-sync-device-select').addEventListener('change', function (event) {
      var device = state.dashboard().devices.find(function (item) { return item.deviceId === event.currentTarget.value; });
      element('cloud-sync-rename-value').value = device ? device.deviceName : '';
    });
    element('cloud-sync-rename').addEventListener('click', function () {
      run('正在重命名设备…', function () { return syncClient.renameDevice(element('cloud-sync-device-select').value,
        element('cloud-sync-rename-value').value); }, '设备名称已更新。');
    });
    element('cloud-sync-revoke').addEventListener('click', function () {
      run('正在撤销设备…', function () { return syncClient.revokeDevice(element('cloud-sync-device-select').value,
        element('cloud-sync-revoke-delete').checked); }, '设备已撤销。');
    });
    element('cloud-sync-password-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form);
      clearSecrets(form);
      run('正在修改同步密码…', function () { return syncClient.changePassword(input); }, '同步密码已修改。');
    });
    element('cloud-sync-recovery-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form);
      clearSecrets(form);
      input.confirmRecoveryCredentials = showRecovery;
      run('正在轮换恢复密钥…', function () { return syncClient.rotateRecoveryKey(input); }, '恢复密钥已轮换，旧密钥已失效。');
    });
    element('cloud-sync-forget').addEventListener('click', function () {
      if (!root.confirm('忘记本设备只会清除本机云同步凭据，不会删除个人进度。是否继续？')) return;
      run('正在忘记本设备…', function () { return syncClient.forgetCurrentDevice(); }, '已忘记本设备，本机个人进度仍保留。');
    });
    element('cloud-sync-delete-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget, input = values(form), confirmation = input.confirmation;
      delete input.confirmation;
      clearSecrets(form);
      input.confirmDeleteSpace = function () { return confirmation; };
      run('正在永久删除同步空间…', function () { return syncClient.deleteSpace(input); }, '同步空间已永久删除，本机个人进度仍保留。');
    });
    element('cloud-sync-rollback-restore').addEventListener('click', function () {
      run('正在恢复覆盖前数据…', function () { return syncClient.recoverInterruptedRollback('restore'); },
        '覆盖前数据已恢复，工具即将重新载入。', false);
    });
    element('cloud-sync-rollback-discard').addEventListener('click', function () {
      if (!root.confirm('确认保留当前数据并删除本机回滚副本？此操作不可撤销。')) return;
      run('正在删除本机回滚副本…', function () { return syncClient.recoverInterruptedRollback('discard'); },
        '已保留当前数据并删除回滚副本。', false).then(function (result) {
          if (result) element('cloud-sync-rollback').hidden = true;
        });
    });

    renderActionState();
    refreshDashboard().then(resumePending).catch(function (error) {
      status('无法读取云同步状态：' + (error && error.message ? error.message : '未知错误'), true);
      renderDashboard({ paired: false, devices: [] });
    });
    return Object.freeze({ state: state, refresh: refreshDashboard });
  }

  sync.createSync = createSync;
  sync.createSettingsState = createSettingsState;
  sync.bindSettingsUI = bindSettingsUI;
  if (root.document) bindSettingsUI(sync, root.document);
  return sync;
});
