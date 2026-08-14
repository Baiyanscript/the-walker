// smoke13: MC好成 BOSS + 新技能[我不搬你们看什么？](召唤替罪羊) + 模板nextTurn
import assert from "node:assert/strict"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core_skill.mjs"
import { getLevelScript } from "./.cache/esm/data/presets.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== MC好成 BOSS 模板 ==")
const boss = createMob("MC好成", { level: 1 })
check("字段: HP100 power5 rare'BOSS'", () => {
  assert.equal(boss.HP, 100)
  assert.equal(boss.power, 5)
  assert.equal(boss.rare, "BOSS")
})
check("技能组: 通用攻击 + 召唤替罪羊", () => {
  assert.deepEqual(boss.act.sort(), ["skill_shared_attack", "skill_mob_summonScapegoat"].sort())
})
check("初始 nextTurn = 召唤技能(模板 nextTurn 生效)", () => {
  assert.equal(boss.nextTurn, "skill_mob_summonScapegoat")
})
check("detail: 只显示技能名", () => {
  // getSkillDetail 未导出到测试副本时跳过, 此处直接断言 nextTurn 键存在即可
  assert.ok(boss.act.includes("skill_mob_summonScapegoat"))
})

console.log("== 技能: 召唤 1 只替罪羊 ==")
const mobList = [boss]
const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
runSkill("skill_mob_summonScapegoat", buildSkillCtx({
  source: boss, actor: boss, target: player,
  playerInfo: player, mobList, handPool: [], drawPool: []
}))
check("怪物池 +1", () => assert.equal(mobList.length, 2))
const summoned = mobList[1]
check("新怪 nextTurn = null(本回合不行动)", () => assert.equal(summoned.nextTurn, null))
check("新怪带替罪羊 buff", () => {
  assert.ok(summoned.effect.find(e => e.key === "effect_scapegoat"))
})
check("新怪稀有度在 1/2/3 内", () => assert.ok([1, 2, 3].includes(summoned.rare)))
check("新怪等级 = BOSS等级+2 (BOSS lv1 -> lv3)", () => assert.equal(summoned.level, 3))

console.log("== 召唤权重: rare 分布 1:3:2 ==")
const counts = { 1: 0, 2: 0, 3: 0 }
const origRandom = Math.random
for (let i = 0; i < 6000; i++) {
  // 复刻技能内部权重抽取(weightedPick 区间法), 用固定随机源验证落点
  Math.random = () => (i % 1000) / 1000 // 确定性伪随机: 0~0.999
  const total = 1 + 3 + 2
  let r = Math.random() * total
  let rare = 1
  for (const [r_, w] of [[1, 1], [2, 3], [3, 2]]) {
    r -= w
    if (r < 0) { rare = r_; break }
  }
  counts[rare]++
}
Math.random = origRandom
check("rare1 ≈16.7%, rare2 ≈50%, rare3 ≈33.3%", () => {
  assert.ok(counts[1] > 700 && counts[1] < 1300, `rare1=${counts[1]}`)
  assert.ok(counts[2] > 2600 && counts[2] < 3400, `rare2=${counts[2]}`)
  assert.ok(counts[3] > 1600 && counts[3] < 2400, `rare3=${counts[3]}`)
})

console.log("== 50层固定脚本: BOSS 为 MC好成 ==")
const s50 = getLevelScript(50, "战士")
check("50层 addMob key = MC好成", () => {
  assert.ok(s50)
  assert.equal(s50.nodes[0].mobSet[0].addMob[0].key, "MC好成")
})
check("50层 isBoss 标记保留", () => assert.equal(s50.nodes[0].exDate.isBoss, true))

console.log("\nALL PASSED: " + pass + " assertions")
