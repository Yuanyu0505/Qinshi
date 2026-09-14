/**
 * 手动云同步协调层。网络、浏览器、时钟与存储均可注入；不启动后台同步。
 * 密码/恢复密钥仅在创建或加入调用内使用，不进入持久化状态或日志。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.QinshiCloudSync = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024;

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

  function createSync(dependencies) {
    var options = dependencies || {};
    var pendingUpload = null; // Same-page retries reuse immutable ciphertext, never recollect data.
    var pendingEnrollment = null; // Request proof only; never password or recovery key, never persisted.
    var busy = false;

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

    async function handleFailure(error) {
      if (error && error.code === 'DEVICE_REVOKED' && error.pairingInvalid === true) {
        pendingUpload = null;
        pendingEnrollment = null;
        // UI may await the notice before local credentials disappear. Without an
        // injected callback this is a no-op; the original safe API error still reaches UI.
        try {
          if (typeof options.notifyPairingInvalid === 'function') {
            await options.notifyPairingInvalid(Object.freeze({ code: 'DEVICE_REVOKED',
              message: '本设备的配对已失效或被撤销，请重新配对。' }));
          }
        } catch (noticeError) { /* Never expose callback details or hide revocation. */ }
        try { await storage().forgetPairing(); }
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

    async function preflight() {
      var limits = await api().health();
      var result = await dependency('pwa', 'QinshiPWA').ensureCurrentForSync(limits);
      if (!result || result.ready !== true) throw new Error('请先完成版本检查或更新工具后再继续同步。');
      core().assertVersionAllowed(version(), limits, 'write');
      return limits;
    }

    async function requirePairing() {
      var pairing = await storage().loadPairing();
      if (!pairing) throw new Error('请先配对云同步设备。');
      return pairing;
    }

    async function requireUnpaired() {
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

    async function savePairing(response, spaceId, device, name, masterKey) {
      if (!response || response.spaceId !== spaceId || response.deviceId !== device.deviceId) throw new Error('同步服务配对响应不正确。');
      core().assertVersionAllowed(version(), response, 'write');
      await storage().savePairing({ spaceId: spaceId, deviceId: device.deviceId,
        deviceToken: device.deviceToken, masterKey: masterKey, deviceName: name, pairedAt: now() });
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
      var result = await api().listDevices();
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
        var session = await api().createUpload(pending.body, pending.operationId);
        if (!session || session.snapshotId !== pending.body.snapshotId || typeof session.uploadId !== 'string' ||
          !Array.isArray(session.uploadedChunks)) throw new Error('上传会话响应不正确。');
        pending.uploadId = session.uploadId;
        for (var chunk of pending.chunks) {
          if (session.uploadedChunks.indexOf(chunk.index) === -1) {
            await api().putChunk(session.uploadId, chunk.index, decode(chunk.data), chunk.digest);
          }
        }
        // A committed receipt outlives snapshot/history ciphertext. Once a commit
        // might have reached the server, replay it directly; never put chunks again.
        pending.commitBody = { beforeUploadId: null, sourceSnapshotId: null };
        pending.phase = 'commit-pending';
      }
      var committed = await api().commitUpload(pending.uploadId, pending.commitBody, pending.operationId);
      if (!committed || committed.latestSnapshotId !== pending.body.snapshotId || committed.operationId !== pending.uploadId) throw new Error('上传提交响应不正确。');
      await storage().clearPendingOperation();
      pendingUpload = null;
      return { status: 'uploaded', snapshotId: committed.latestSnapshotId };
    }

    async function uploadCurrent() {
      // Health + PWA gate happens before reading qinshi_ or doing snapshot crypto.
      await preflight();
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
        deviceId: pairing.deviceId, body: body, chunks: chunks.chunks };
      await storage().savePendingOperation({ type: 'upload', snapshotId: snapshotId });
      return sendUpload(pendingUpload);
    }

    async function resumePendingOperation() {
      return exclusive(async function () {
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
        return { status: 'pending', operation: pending };
      });
    }

    return {
      createSpace: createSpace, joinSpace: joinSpace,
      uploadCurrentDevice: function () { return exclusive(uploadCurrent); },
      getDashboard: getDashboard,
      forgetCurrentDevice: function () { return exclusive(async function () {
        pendingUpload = null; pendingEnrollment = null; await storage().forgetPairing();
      }); },
      resumePendingOperation: resumePendingOperation,
      detectDeviceName: detectDeviceName, normalizeSyncCode: normalizeSyncCode
    };
  }

  var sync = createSync();
  sync.createSync = createSync;
  return sync;
});
