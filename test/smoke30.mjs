// smoke30: 专属卡 limit 来源白名单(需求.md 2026-08-16)——匹配规则(isStrict/allowCommon/交集)
// + 边界卡"无符合条件卡" + getCardSources 来源组装 + cardGain/shop 来源过滤
import assert from "node:assert/strict"
import { createCard, createCardByRare, isCardEligible, NO_MATCH_CARD_NAME, card_LIB, cardByRare } from "./.cache/esm/common/data/cards.mjs"
import { getCardSources, generators } from "./.cache/esm/common/data/generators.mjs"
import { relic_LIB, rollRelicCandidates } from "./.cache/esm/common/data/relics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

/**
 * 动态候选集: 与 createCardByRare 内部同一套 isTplEligible 过滤规则推导,
 * 不硬编码卡名白名单——新增卡牌/调整 limit 不会误伤本测试,
 * 断言语义 = "抽取结果必须落在规则允许的候选集内"。
 */
function eligibleKeys(rare, RL, opts = {}) {
  return (cardByRare[rare] || []).filter(key => isCardEligible(key, RL, opts))
}

console.log("== 匹配规则(isCardEligible) ==")
check("无限制卡(斩击): allowCommon true 进池 / false 拒绝", () => {
  assert.equal(isCardEligible("斩击", []), true)
  assert.equal(isCardEligible("斩击", [], {allowCommon: false}), false)
})
check("鱼竿(limit 老渔夫): RL 空拒绝 / 交集命中", () => {
  assert.equal(isCardEligible("钓鱼佬的鱼竿", []), false, "RL 空: 专属卡拒绝")
  assert.equal(isCardEligible("钓鱼佬的鱼竿", ["BOSS"]), false, "无交集: 拒绝")
  assert.equal(isCardEligible("钓鱼佬的鱼竿", ["老渔夫"]), true)
  assert.equal(isCardEligible("钓鱼佬的鱼竿", ["BOSS", "老渔夫"]), true, "多来源含老渔夫: 命中")
})
check("非欧立方(七咒专属BOSS卡, limit七咒BOSS+isStrict): 仅七咒BOSS战可用", () => {
  assert.equal(isCardEligible("非欧立方", ["七咒", "BOSS"]), true, "七咒玩家BOSS战: 可出")
  assert.equal(isCardEligible("非欧立方", ["BOSS"]), false, "战士BOSS战: 拒(CL⊄RL)")
  assert.equal(isCardEligible("非欧立方", ["七咒"]), false, "七咒普通战: 拒(缺BOSS来源)")
  assert.equal(isCardEligible("非欧立方", ["老渔夫"]), false)
  assert.equal(isCardEligible("非欧立方", []), false)
})
check("严格模式: 卡牌严格(CL⊆RL) / 卡池严格(RL⊆CL) / 双严格(相等)", () => {
  // 临时卡A: CL=["七咒","老渔夫"], isStrict=true —— 测卡严格
  // 临时卡B: CL=["七咒","老渔夫"], isStrict 缺省 —— 测池严格/非严格交集
  card_LIB["__smoke30_tmp__"] = { name: "测试卡", power: 1, rare: 3, costAP: 1, limit: ["七咒", "老渔夫"], isStrict: true }
  card_LIB["__smoke30_tmp2__"] = { name: "测试卡2", power: 1, rare: 3, costAP: 1, limit: ["七咒", "老渔夫"] }
  try {
    // 卡严格(卡A): CL 必须被 RL 完全包含
    assert.equal(isCardEligible("__smoke30_tmp__", ["七咒"]), false, "卡严格: 部分覆盖拒绝")
    assert.equal(isCardEligible("__smoke30_tmp__", ["七咒", "老渔夫", "BOSS"]), true, "卡严格: 完全包含可用")
    // 池严格(卡B, 卡非严格): RL 必须被 CL 完全包含
    assert.equal(isCardEligible("__smoke30_tmp2__", ["七咒"], {poolStrict: true}), true, "池严格: RL⊆CL 可用")
    assert.equal(isCardEligible("__smoke30_tmp2__", ["BOSS"], {poolStrict: true}), false, "池严格: 不覆盖拒绝")
    // 双严格(卡A + 池严格): 两个包含关系都满足(等价相等)
    assert.equal(isCardEligible("__smoke30_tmp__", ["七咒", "老渔夫"], {poolStrict: true}), true, "双严格: 相等可用")
    assert.equal(isCardEligible("__smoke30_tmp__", ["七咒"], {poolStrict: true}), false, "双严格: 不等拒绝")
    // 非严格默认(卡B): 交集即可
    assert.equal(isCardEligible("__smoke30_tmp2__", ["七咒"]), true, "非严格: 交集命中")
    assert.equal(isCardEligible("__smoke30_tmp2__", ["BOSS"]), false, "非严格: 无交集拒绝")
  } finally {
    delete card_LIB["__smoke30_tmp__"]
    delete card_LIB["__smoke30_tmp2__"]
  }
})

console.log("== 边界卡(无符合条件者) ==")
check("池内无候选 -> 返回'无符合条件卡'斩击(exhaust 销毁)", () => {
  const c = createCardByRare({ rare: 3, limit: ["不存在"], allowCommon: false })
  assert.equal(c.name, NO_MATCH_CARD_NAME)
  assert.equal(c.exhaust, true, "带销毁诅咒")
  assert.equal(c.rare, 1) // 斩击模板
  assert.equal(c.tplKey, "斩击")
})
check("稀有度无此池(如99) -> 同样边界卡", () => {
  const c = createCardByRare({ rare: 99 })
  assert.equal(c.name, NO_MATCH_CARD_NAME)
})
check("旧式数字参数兼容: createCardByRare(2) 仍可用", () => {
  const c = createCardByRare(2, { level: 1 })
  assert.equal(c.rare, 2)
  assert.ok(cardByRare[2].includes(c.tplKey))
})

console.log("== 来源组装(getCardSources) ==")
check("无 source 无节点 -> 空列表", () => {
  assert.deepEqual(getCardSources({}), [])
  assert.deepEqual(getCardSources({source: undefined}, {}), [])
})
check("玩家预设来源(七咒/富二代)透传", () => {
  assert.deepEqual(getCardSources({source: ["七咒"]}), ["七咒"])
  assert.deepEqual(getCardSources({source: ["富二代"]}, {exDate: {}}), ["富二代"])
})
check("BOSS 战自动追加 BOSS 来源", () => {
  assert.deepEqual(getCardSources({}, {exDate: {isBoss: true}}), ["BOSS"])
})
check("节点 cardSource 追加(25层老渔夫)", () => {
  assert.deepEqual(getCardSources({source: ["七咒"]}, {exDate: {isBoss: true, cardSource: ["老渔夫"]}}),
    ["七咒", "BOSS", "老渔夫"])
})

console.log("== cardGain/shop 来源过滤 ==")
check("cardGain: 七咒玩家普通奖励不出 BOSS/老渔夫专属卡", () => {
  for (let i = 0; i < 50; i++) {
    const cards = generators.cardGain_common({ isBoss: false, sources: ["七咒"], rewardLevel: 1 })
    for (const c of cards) {
      const cl = c.limit || []
      assert.ok(!cl.includes("BOSS") && !cl.includes("老渔夫"), "七咒来源不可见 BOSS/老渔夫卡")
    }
  }
})
check("cardGain: BOSS 战(50层)纯专属, 不出鱼竿", () => {
  // 动态候选集: 来源过滤后的 BOSS 专属池(不硬编码卡名)
  const bossPool = eligibleKeys(3, ["BOSS"], {allowCommon: false})
  assert.ok(bossPool.length > 0, "BOSS 专属池非空")
  assert.ok(bossPool.includes("启示录"), "BOSS 专属池含 BOSS 专属卡(方向校验)")
  for (let i = 0; i < 50; i++) {
    const cards = generators.cardGain_common({ isBoss: true, sources: ["BOSS"], rewardLevel: 1 })
    for (const c of cards) {
      assert.ok(bossPool.includes(c.tplKey), `仅BOSS来源只出BOSS专属卡, 却出现 ${c.name}`)
      assert.equal(c.upgraded, true)
    }
  }
})
check("shop: 富二代玩家商店商品不出 BOSS/老渔夫专属卡", () => {
  for (let i = 0; i < 50; i++) {
    const goods = generators.shop_common.generateGoods({ playerInfo: {source: ["富二代"]}, sources: ["富二代"], rewardLevel: 1 })
    for (const g of goods) {
      if (g.type === "card") {
        const cl = g.card.limit || []
        assert.ok(!cl.includes("BOSS") && !cl.includes("老渔夫"), "富二代商店不可见 BOSS/老渔夫卡")
      }
    }
  }
})
check("shop: 老渔夫专属卡经 BOSS+老渔夫来源可上架(25层奖励后商店语义验证)", () => {
  // 25 层奖励返回后商店仍继承来源? —— 节点级来源仅作用于该节点, 商店走玩家来源;
  // 此处仅验证"来源过滤不会误伤通用卡"
  const goods = generators.shop_common.generateGoods({ playerInfo: {source: []}, sources: [], rewardLevel: 1 })
  const cardGoods = goods.filter(g => g.type === "card")
  assert.ok(cardGoods.length === 3)
  for (const g of cardGoods) {
    assert.ok(!g.card.limit, "普通玩家商店只有通用卡")
  }
})

console.log("== 预设专属 BOSS 卡(七咒BOSS: limit:[\"七咒\",\"BOSS\"] + isStrict) ==")
check("判定矩阵: 七咒BOSS战可出 / 战士BOSS战拒 / 七咒普通战拒", () => {
  // 临时卡: 七咒专属 BOSS 卡(双重来源 + 卡牌严格)
  card_LIB["__七咒BOSS卡__"] = { name: "七咒BOSS卡", power: 12, rare: 3, costAP: 4, limit: ["七咒", "BOSS"], isStrict: true }
  cardByRare[3].push("__七咒BOSS卡__") // 手动入索引(临时卡不进自动索引)
  try {
    // ① 七咒玩家打 BOSS(RL=["七咒","BOSS"]): CL⊆RL -> 可用
    assert.equal(isCardEligible("__七咒BOSS卡__", ["七咒", "BOSS"]), true, "七咒BOSS战: 可出")
    // ② 战士玩家打 BOSS(RL=["BOSS"]): CL⊄RL -> 拒(专属语义不被交集破坏)
    assert.equal(isCardEligible("__七咒BOSS卡__", ["BOSS"]), false, "战士BOSS战: 拒")
    // ③ 七咒玩家普通战斗/商店(RL=["七咒"]): "BOSS"∉RL -> 拒(仅BOSS战出)
    assert.equal(isCardEligible("__七咒BOSS卡__", ["七咒"]), false, "七咒普通战: 拒")
    // ④ 普通玩家任意来源(RL=[]): 拒
    assert.equal(isCardEligible("__七咒BOSS卡__", []), false, "普通玩家: 拒")

    // ⑤ 整链路: 七咒玩家 BOSS 奖励 = 普通BOSS卡 + 七咒BOSS卡 混合池(allowCommon:false)
    //    候选集动态推导(交集规则下七咒普通专属卡如倒转之启也可见), 不硬编码卡名
    const mixedPool = eligibleKeys(3, ["七咒", "BOSS"], {allowCommon: false})
    assert.ok(mixedPool.includes("__七咒BOSS卡__"), "混合池含七咒BOSS专属卡(混合池生效)")
    let seenSeven = false
    for (let i = 0; i < 200 && !seenSeven; i++) {
      const c = createCardByRare({ rare: 3, limit: ["七咒", "BOSS"], allowCommon: false }, { level: 1 })
      assert.ok(mixedPool.includes(c.tplKey), `混合池出现 ${c.name}`)
      if (c.tplKey === "__七咒BOSS卡__") seenSeven = true
    }
    assert.ok(seenSeven, "200 次内应抽到七咒BOSS卡(混合池生效)")

    // ⑥ 战士玩家 BOSS 奖励: 永不出现七咒BOSS卡
    for (let i = 0; i < 200; i++) {
      const c = createCardByRare({ rare: 3, limit: ["BOSS"], allowCommon: false }, { level: 1 })
      assert.notEqual(c.tplKey, "__七咒BOSS卡__", "战士BOSS奖励不应出七咒BOSS卡")
    }

    // ⑦ 七咒玩家普通奖励(allowCommon:true): 不出七咒BOSS卡(仅通用rare3 + 七咒普通专属)
    for (let i = 0; i < 200; i++) {
      const c = createCardByRare({ rare: 3, limit: ["七咒"], allowCommon: true }, { level: 1 })
      assert.notEqual(c.tplKey, "__七咒BOSS卡__", "七咒普通奖励不应出七咒BOSS卡")
    }
  } finally {
    delete card_LIB["__七咒BOSS卡__"]
    cardByRare[3].splice(cardByRare[3].indexOf("__七咒BOSS卡__"), 1)
  }
})

console.log("== 看门人(require: 至少包含) ==")
check("require 判定: 普通七咒卡被拒 / 七咒BOSS卡与普通BOSS卡放行", () => {
  // 临时卡: 七咒普通卡(非严格) + 七咒BOSS卡(卡牌严格)
  card_LIB["__七咒普通__"] = { name: "七咒普通卡", power: 3, rare: 3, costAP: 1, limit: ["七咒"] }
  card_LIB["__七咒BOSS__"] = { name: "七咒BOSS卡", power: 12, rare: 3, costAP: 4, limit: ["七咒", "BOSS"], isStrict: true }
  cardByRare[3].push("__七咒普通__", "__七咒BOSS__")
  try {
    // 七咒玩家 BOSS 战(RL=["七咒","BOSS"]): 不加 require 时普通七咒卡也会进(交集)
    assert.equal(isCardEligible("__七咒普通__", ["七咒", "BOSS"]), true, "无require: 七咒普通卡交集进")
    // 加 require:["BOSS"] 看门人后: 只放行 limit 含 BOSS 的卡
    assert.equal(isCardEligible("__七咒普通__", ["七咒", "BOSS"], {required: ["BOSS"]}), false, "看门人: 七咒普通卡拒")
    assert.equal(isCardEligible("__七咒BOSS__", ["七咒", "BOSS"], {required: ["BOSS"]}), true, "看门人: 七咒BOSS卡放行")
    assert.equal(isCardEligible("非欧立方", ["七咒", "BOSS"], {required: ["BOSS"]}), true, "看门人: 七咒BOSS卡放行")
    // 无 limit 通用卡: CL 为空不含 BOSS -> 同样被拒(即使 allowCommon:true)
    assert.equal(isCardEligible("斩击", ["七咒", "BOSS"], {required: ["BOSS"]}), false, "看门人: 通用卡拒")

    // 整链路: 七咒玩家 BOSS 奖励 + require -> 池 = BOSS级卡, 无七咒普通卡
    //    候选集动态推导(看门人过滤), 不硬编码卡名
    const gatePool = eligibleKeys(3, ["七咒", "BOSS"], {allowCommon: false, required: ["BOSS"]})
    assert.ok(gatePool.includes("__七咒BOSS__"), "看门人池含七咒BOSS专属卡")
    assert.ok(!gatePool.includes("__七咒普通__"), "看门人池不含七咒普通卡")
    let seenSevenBoss = false
    for (let i = 0; i < 200 && !seenSevenBoss; i++) {
      const c = createCardByRare({ rare: 3, limit: ["七咒", "BOSS"], allowCommon: false, require: ["BOSS"] }, { level: 1 })
      assert.ok(gatePool.includes(c.tplKey), `看门人池出现 ${c.name}`)
      if (c.tplKey === "__七咒BOSS__") seenSevenBoss = true
    }
    assert.ok(seenSevenBoss, "200 次内应抽到七咒BOSS卡(看门人池生效)")

    // require 不替代来源检查: 战士 BOSS 战(RL=["BOSS"]), 七咒BOSS卡 isStrict 仍被拦
    assert.equal(isCardEligible("__七咒BOSS__", ["BOSS"], {required: ["BOSS"]}), false, "require不能越权: 战士BOSS战仍拒七咒BOSS卡")
  } finally {
    delete card_LIB["__七咒普通__"]
    delete card_LIB["__七咒BOSS__"]
    for (const k of ["__七咒普通__", "__七咒BOSS__"]) {
      const i = cardByRare[3].indexOf(k)
      if (i !== -1) cardByRare[3].splice(i, 1)
    }
  }
})

console.log("== 遗物 limit(来源专属, 与卡牌共用 isTplEligible) ==")
check("遗物 limit: 七咒专属遗物仅七咒来源可见", () => {
  relic_LIB["__七咒遗物__"] = { name: "七咒遗物", desc: "测试", limit: ["七咒"] }
  try {
    const seven = rollRelicCandidates(99, [], {sources: ["七咒"]})
    assert.ok(seven.some(r => r.key === "__七咒遗物__"), "七咒来源可见七咒遗物")
    assert.ok(!rollRelicCandidates(99, [], {sources: []}).some(r => r.key === "__七咒遗物__"), "普通玩家不可见")
    assert.ok(!rollRelicCandidates(99, [], {sources: ["BOSS"]}).some(r => r.key === "__七咒遗物__"), "BOSS来源不可见")
  } finally { delete relic_LIB["__七咒遗物__"] }
})
check("遗物 require 看门人: 只出 BOSS 级遗物(七咒玩家BOSS场景)", () => {
  relic_LIB["__七咒遗物__"] = { name: "七咒遗物", desc: "测试", limit: ["七咒"] }
  relic_LIB["__BOSS遗物__"] = { name: "BOSS遗物", desc: "测试", limit: ["BOSS"] }
  try {
    const cands = rollRelicCandidates(99, [], {sources: ["七咒", "BOSS"], require: ["BOSS"]})
    assert.ok(cands.some(r => r.key === "__BOSS遗物__"), "BOSS级遗物放行")
    assert.ok(!cands.some(r => r.key === "__七咒遗物__"), "七咒遗物被看门人拒")
    assert.ok(cands.every(r => (r.limit || []).includes("BOSS")), "池内全部为BOSS级遗物")
  } finally {
    delete relic_LIB["__七咒遗物__"]
    delete relic_LIB["__BOSS遗物__"]
  }
})
check("铜制核心(limit BOSS): 普通玩家抽不到, BOSS 来源可见", () => {
  assert.ok(!rollRelicCandidates(99, [], {sources: []}).some(r => r.key === "relic_copperCore"), "普通遗物区无铜制核心")
  assert.ok(rollRelicCandidates(99, [], {sources: ["BOSS"]}).some(r => r.key === "relic_copperCore"), "BOSS来源可见铜制核心")
})
check("遗物区生成器链路: 七咒玩家候选含七咒专属遗物", () => {
  relic_LIB["__七咒遗物__"] = { name: "七咒遗物", desc: "测试", limit: ["七咒"] }
  try {
    const cands = generators.relic_common({relics: [], source: ["七咒"]}, 99, ["七咒"])
    assert.ok(cands.some(r => r.key === "__七咒遗物__"), "relic_common 透传 sources 生效")
  } finally { delete relic_LIB["__七咒遗物__"] }
})
check("商店遗物商品: 普通玩家不出 BOSS 专属遗物(铜制核心)", () => {
  for (let i = 0; i < 50; i++) {
    const goods = generators.shop_common.generateGoods({ playerInfo: {relics: []}, sources: [], rewardLevel: 1 })
    for (const g of goods) {
      if (g.type === "relic") assert.notEqual(g.key, "relic_copperCore", "普通商店不应上架铜制核心")
    }
  }
})

console.log("\nALL PASSED: " + pass + " assertions")
