# 秘境分区设计

用户已在对话中完成27项规则确认，并确认完整方案。设计文档和实施计划无需再次审批；实施后连续两轮测试全绿才可合并master、推送远程main、发布PWA。

## 意图、范围与选择

为自己的多个游戏账号管理秘境抽数、实际获取和跨期购买规划。不是自动充值、自动抽卡或游戏账号接口。沿用原生JS、本地账号存储、离线PWA和现有后台计算，不新增付费依赖或外部服务。选择目标驱动的精确规划；固定礼包模板不能覆盖任意目标和逐期来源勾选，服务端计算则增加不必要依赖。

个人进度、目标规划、资料参考三个子页。两个秘境初始为鬼谷盖聂(guigu)第6期未开始、千泷高月(gaoyue)第2期未开始；此前期数永久锁定，不填写历史来源明细。每个账号各秘境独立，平台设置和代金同账号共用。删除结束的秘境不影响其他账号/共用设置，删除后不自动重建。清空整个账号后按工具惯例恢复初始空数据。

## 来源和奖励

data/secret-realm.js为唯一资料源。来源id、每份抽数、单价(元)、单期上限：first-gift/19/0/1(仅第1期显示)，ingots/10/0/1(另消耗2000元宝)，zero-ticket/1/0/14(每日1次)，daily-free/1/0/14(每日1次)，panda/35/0/1，free-pass/11/0/1，paid-pass/88/98/1，pack6/3/6/14(每日1次)，pack30/10/30/6，pack98/30/98/4，pack198/55/198/2，pack328/80/328/2，pack648/130/648/无限。

付费通行证为额外88抽，不重复免费11抽；通行证默认剩余可领完。每日3个来源错过不补，其他礼包可任意一天买满。每期适用来源默认全选，648关闭。全选常规来源不启用648，全部取消会关闭648。逐期配置，可应用到后续各期；第1期赠送后续既不显示也不计算。勾选付费仅表示允许0至上限购买，不强制买满。元宝不折算人民币，不设元宝库存。

奖励门槛/名称：100弟子魂魄；200弟子神魄；350神兵武器；500神兵衣服；650/1000/1650/2300为298时装；750神兵饰品；850神兵典籍；1150武器；1300为598时装；1400衣服；1500饰品；1800/3100聚神印；1950戎装；2050典籍；2150/4100机关碎片；2450/4400觉醒神图；2600当期称号；2700/2950元宝；2800神果；3250称号；3350联动神将；3450武器；3600防具；3750饰品；3900典籍；4000联动神将戎装；4250联动神将神魄；4550联动神将称号。共35档，保留泛称，不猜数量，不自动关联装备/弟子。

## 时间及实际记录

北京时间UTC+8，开始日00:00至第15日00:00为完整14天。尚未开始可改日期，开始即锁定，结束永久锁定；不能用改日期重新开放已结束期。首次设置必须保证不是已结束日期；不允许同秘境已设置期次日期重叠或逆序。日期/状态按账号分别保存，不猜开期日期。

未开始只可规划，不生成实际记录。进行中记录各来源obtained、purchased及每日来源todayDate/todayObtained，pack6另存todayPurchased区分今天购买但尚未领取。保存实际记录为显式行保存，日期和输入一起校验，不在输入半途中误存。已购但未领完权益=已购次数×每份抽数-已获取，不重复收钱。累计已抽cumulative、持有未用inventory、来源已获取是独立口径，来源修改不自动增减前两项。

结束自动进入下一期预规划；来源实际明细丢弃(只留最小日期/状态)，仅累计和库存延续，不把预测写成实绩。不设置下一期日期时显示待设置日期，按完整14天规划。不回退期数。第6期结束finished=true，可二次确认删除秘境。定时、前台恢复、切入分区及每次读写/计算前复核时间，后台旧结果若跨边界则丢弃。

## 存储、接口和严格验证

账号逻辑键qinshi_secret_realms_v1，单个原子JSON写入包含schemaVersion:1、realms对象、settings。不存在时创建默认值；已有realms={}表示已删除，不重新补齐。损坏JSON/非法数值保护原存储，不回写空值。所有写入走QinshiAccounts并新鲜读取、编辑权校验；失败显示原因，保留上次持久化值。普通只读状态允许查看和临时计算但不写入。

realm={currentPeriod,cumulative,inventory,target,finished,periods:{number:{startDate,locked,ended,sources:{id:{enabled,obtained,purchased,todayDate,todayObtained,todayPurchased}}}}}。仅currentPeriod及以后可改配置；各期源enabled保存，旧期来源明细结束清除。settings={platformId,platforms:[{id,name,discount}],vouchers,useVouchers}，discount表示几折，0<discount<=10，代金元。整数用安全整数验证，金额用分验证，禁止负数、Infinity、NaN及空字符串被悄悄当0。目标默认4550，允许其他非负安全整数；不凭奖励表4500封顶。计算溢出或非法输入明确报错。

SECRET_REALM_CORE接口：createDefault(data)、normalize(raw,data)、advance(state,now,data)、status(realm,period,now,data)、setStartDate(state,id,period,date,now,data)、updateTotals(state,id,values,data)、updateSource(state,id,period,sourceId,values,now,data)、setEnabled(state,id,period,sourceId,enabled,now,data)、setAll(state,id,period,enabled,now,data)、applyFollowing(state,id,period,now,data)、updateSettings(state,settings,data)、deleteRealm(state,id,now,data)、buildPlanningInput(state,id,now,data)。均纯函数返回新对象，不改变传入值；错误throw带中文说明。now为Unix毫秒。status返回phase(upcoming/active/ended)、today(YYYY-MM-DD)、day、endDate。

buildPlanningInput输出{cumulative,inventory,target,discount,vouchers,useVouchers,periods:[{number,sources:[{id,name,draws,price,maxPurchases,availableDraws}]}]}。enabled=false来源不输出；已领抽数不再次输出，已购未领取及免费可获得部分放availableDraws(不需新增付费)，付费新增上限放maxPurchases，648上限null表示无限。单期未开始不得有实际数；当前期每日剩余额度按第几天与今日状态扣减，不按14-已领简单推算。已结束、已删除、finished不产生可计划期。

## 精确规划及费用

SECRET_REALM_PLANNER.plan(input)返回{valid,error,fastest,cheapest,maxReachable,shortfall}。方案={reachPeriod,availableTotal,surplus,totalBefore,voucherUsed,totalAfter,periods:[{number,draws,before,voucherUsed,after,rows:[{id,name,availableDraws,purchases,draws,before,voucherUsed,after}]}]}；金额输出元，内部整数分。规划不写入进度/代金。累计+库存已达标时零购买，不依赖任何来源。

最快：最早期数、最少折后现金、最少代金、最少超出。最省钱：最少折后现金、最少代金、最早期数、最少超出。不让不同目标偷偷使用不同648许可。有限礼包用精确有界组合，648可数学计算补足数量；不因任意大目标分配同等大数组，不用贪心冒充最优。小规模穷举独立验证最优。

平台默认小7/果盘4折、游戏fan/木蚂蚁4.3折、直充10折；支持自定义名称/折扣保存。代金默认启用、无有效期或礼包限制，按期及来源顺序抵扣折前费用。折后现金=max(0,折前-使用代金)×折扣/10。展示折前原价、代金抵扣、抵后折前应付、折后现金，每期/总计及每行可核对。最终按分结算并确定性分配尾差，不出现负值或行总计不一致。两个秘境单独方案都可参考同一余额，但明确提示不是跨秘境联合预算，计算不会扣余额。

## 体验及验收

按需加载新数据/核心/规划/UI，Worker kind=secret-realm，HTTP/PWA离线可用，file://可用既有回退。输入/切期/切秘境/换账号/离开/时间边界取消任务，结果核对账号和输入快照。手机320/390、平板768/1100、桌面1440无页面横溢；长来源用分期卡片，结果详情折叠，不每次键入重建整个页面。导航、标题、hash和更多菜单集成。

账号前缀存储自然进入既有导出/导入/设备快照/账号清空，需要用行为测试证明；不调用真实云服务。发布须同步版本信标、HTML、SW、PWA逻辑、迟加载器，Pages复制清单和离线资源含新文件。最终独立复审，修复后两轮全量Node+浏览器零失败零跳过，再合并本地master并推送origin main。用户Excel与无关未跟踪文件不提交/删除。
