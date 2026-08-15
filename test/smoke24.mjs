// smoke24: 老渔夫限定卡——钓鱼佬的鱼竿(判定吊起/脱钩) + 扔出卡(伤害/释放/销毁诅咒) + 限定卡不进抽取池
import assert from "node:assert/strict"
import { createCard, createCardByRare, cardByRare } from "./.cache/esm/common/data/cards.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { MOB_UNUSABLE_SKILLS } from "./.cache/esm/common/skill/fun_skill.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [], goldNum: 50 })
const mkCtx = (over = {}) => buildSkillCtx({
  source: over.source, actor: over.actor, target: over.target,
  playerInfo: over.playerInfo || mkPlayer(), mobList: over.mobList || [],
  handPool: over.handPool || [], drawPool: over.drawPool || [],
  battlePool: over.battlePool || [], discardPool: over.discardPool || []
})

console.log("== 钓鱼佬的鱼竿: 卡片与限定性 ==")
check("鱼竿: power5 costAP2, rare=limited, 不进1/2/3/boss抽取池", () => {
  const c = createCard("钓鱼佬的鱼竿", { level: 1 })
  assert.equal(c.power, 5)
  assert.equal(c.costAP, 2)
  assert.equal(c.rare, "limited")
  assert.deepEqual(c.doSkill, ["skill_card_fishingRod"])
  for (const rare of [1, 2, 3, "boss"]) {
    assert.ok(!cardByRare[rare].includes("钓鱼佬的鱼竿"), `鱼竿不应在 rare${rare} 池`)
  }
  assert.ok(!MOB_UNUSABLE_SKILLS.includes("skill_card_fishingRod"), "鱼竿不入怪物黑名单(玩家专属)")
})
check("限定卡池存在(老渔夫奖励硬编码用)", () => {
  assert.ok(createCard("钓鱼佬的鱼竿", { level: 1 }))
})

console.log("== 鱼竿判定: rare1 必吊起 ==")
check("rare1怪: 吊起成功, 怪物离场, 扔出卡进存档+渲染层双池", () => {
  const origRandom = Math.random
  try {
    Math.random = () => 0 // 强制吊起成功(100%概率本就必成, mock 保证确定性)
    const player = mkPlayer()
    const mob = createMob("史莱姆", { level: 1 }) // rare1
    const mobList = [mob]
    const drawPool = []
    const battlePool = []
    const skillCtx = mkCtx({ source: createCard("钓鱼佬的鱼竿", { level: 1 }), actor: player, target: mob, mobList, drawPool, battlePool })
    runSkill("skill_card_fishingRod", skillCtx)
    assert.equal(mobList.length, 0, "怪物应被吊起离场")
    assert.equal(drawPool.length, 1, "扔出卡应进存档牌库")
    assert.equal(battlePool.length, 1, "扔出卡应进渲染层卡组")
    const thrown = drawPool[0]
    assert.equal(thrown.name, "扔出·史莱姆")
    assert.equal(thrown.costAP, 2) // rare1 -> 2
    assert.equal(thrown.exhaust, true)
    assert.deepEqual(thrown.doSkill, ["skill_card_thrownMob"])
    assert.ok(thrown.exDate.mobData, "扔出卡应携带怪物数据")
    assert.equal(thrown.exDate.mobData.HP, 10)
    assert.equal(battlePool[0].uid, thrown.uid, "双池同实例")
  } finally {
    Math.random = origRandom
  }
})
check("rare2/rare3 吊起 -> costAP 4/6 (mock 随机数强制成功)", () => {
  const origRandom = Math.random
  try {
    // 强制吊起成功: Math.random()*100 < chance 需成立, 给 0 即可
    Math.random = () => 0
    for (const [rare, expectCost, mobKey] of [[2, 4, "苦力怕"], [3, 6, "萨满哥布林"]]) {
      const mob = createMob(mobKey, { level: 1 })
      const drawPool = []
      const skillCtx = mkCtx({ source: createCard("钓鱼佬的鱼竿", { level: 1 }), actor: mkPlayer(), target: mob, mobList: [mob], drawPool, battlePool: [] })
      runSkill("skill_card_fishingRod", skillCtx)
      assert.equal(drawPool.length, 1, `rare${rare} 应吊起成功`)
      assert.equal(drawPool[0].costAP, expectCost, `rare${rare} 扔出卡 costAP 应为 ${expectCost}`)
    }
  } finally {
    Math.random = origRandom
  }
})

console.log("== 鱼竿判定: BOSS 必脱钩(15伤) ==")
check("BOSS怪: 0%吊起, 造成15伤, 怪物不离场", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 }) // HP 300
  const mobList = [boss]
  const drawPool = []
  const skillCtx = mkCtx({ source: createCard("钓鱼佬的鱼竿", { level: 1 }), actor: player, target: boss, mobList, drawPool, battlePool: [] })
  runSkill("skill_card_fishingRod", skillCtx)
  assert.equal(boss.HP, 285, "BOSS 受 15 伤")
  assert.equal(mobList.length, 1, "BOSS 不被吊起")
  assert.equal(drawPool.length, 0, "不生成扔出卡")
})

console.log("== 扔出卡: 对目标造成血量/3 伤害, 数据怪受20伤并释放 ==")
check("扔出: 目标受 floor(HP/3) 伤, 数据怪-20后回归战场", () => {
  const player = mkPlayer()
  const other = createMob("哥布林", { level: 1 }) // HP 15
  // 构造扔出卡: 封装一只 HP 90 的怪物数据(显式 HP, 不依赖等级公式)
  const mobData = createMob("史莱姆", { HP: 90 })
  const thrown = {
    uid: "throw1", name: "扔出·史莱姆", level: 1, power: 0, costAP: 2,
    doSkill: ["skill_card_thrownMob"], rare: 0,
    exDate: { mobData }, exhaust: true, tplKey: undefined, upgraded: false
  }
  const mobList = [other]
  const skillCtx = mkCtx({ source: thrown, actor: player, target: other, mobList, drawPool: [], battlePool: [] })
  runSkill("skill_card_thrownMob", skillCtx)
  // 目标受 floor(90/3)=30 伤 -> 15HP 的哥布林死亡
  assert.equal(other.HP, 0)
  // 数据怪受20伤: 90-20=70, 存活释放回战场
  assert.equal(mobData.HP, 70)
  assert.ok(mobList.includes(mobData), "数据怪应回归怪物组")
})
check("扔出: 数据怪受20伤后死亡则不释放", () => {
  const player = mkPlayer()
  const mobData = createMob("史莱姆", { level: 1 }) // HP 10
  const thrown = {
    uid: "throw2", name: "扔出·史莱姆", level: 1, power: 0, costAP: 2,
    doSkill: ["skill_card_thrownMob"], rare: 0,
    exDate: { mobData }, exhaust: true, tplKey: undefined, upgraded: false
  }
  const mobList = []
  const skillCtx = mkCtx({ source: thrown, actor: player, target: createMob("哥布林", { level: 1 }), mobList, drawPool: [], battlePool: [] })
  runSkill("skill_card_thrownMob", skillCtx)
  assert.equal(mobData.HP, 0)
  assert.equal(mobList.length, 0, "数据怪死亡不回归")
})

console.log("== 扔出卡销毁诅咒 ==")
check("打出扔出卡后从存档牌库销毁同 uid", () => {
  const player = mkPlayer()
  const drawn = { uid: "u1", name: "斩击", level: 1, power: 8, costAP: 1, doSkill: ["skill_shared_attack"], rare: 1 }
  const thrown = { uid: "u2", name: "扔出·史莱姆", level: 1, power: 0, costAP: 2, doSkill: ["skill_card_thrownMob"], rare: 0, exDate: { mobData: createMob("史莱姆", { level: 1 }) }, exhaust: true }
  const drawPool = [drawn, thrown] // 存档牌库
  const skillCtx = mkCtx({ source: thrown, actor: player, target: createMob("哥布林", { level: 1 }), mobList: [], drawPool, battlePool: [] })
  runSkill("skill_card_thrownMob", skillCtx)
  assert.equal(drawPool.length, 1, "扔出卡应从存档销毁")
  assert.equal(drawPool[0].uid, "u1", "其他卡保留")
})

console.log("\nALL PASSED: " + pass + " assertions")
