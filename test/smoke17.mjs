// smoke17: 怪物maxHP/回血钳制 + sAct行动偏好(暴怒anger/生气power+2) + MC好成召唤先行
import assert from "node:assert/strict"
import { createMob, rollNextTurn } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core_skill.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 怪物 maxHP + 回血钳制 ==")
const knight = createMob("青春生骑士", { level: 1 })
check("青春生骑士: HP10 maxHP10 power2 rare2, act 3技能, sAct[anger]", () => {
  assert.equal(knight.HP, 10)
  assert.equal(knight.maxHP, 10)
  assert.equal(knight.power, 2)
  assert.equal(knight.rare, 2)
  assert.deepEqual(knight.act, ["skill_shared_attack", "skill_shared_defend", "skill_shared_heal"])
  assert.deepEqual(knight.sAct, ["anger"])
})
const slime = createMob("史莱姆", { level: 1 })
check("所有怪都有 maxHP = HP", () => assert.equal(slime.maxHP, slime.HP))
// 回血钳制: 打掉 3 血, 回 5 血 -> 不超 maxHP(10)
slime.HP = 7
const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [] }
runSkill("skill_shared_heal", buildSkillCtx({ source: slime, actor: slime, target: player, targetIndex: null, playerInfo: player, mobList: [slime], handPool: [], drawPool: [] }))
check("怪物回血不超 maxHP (7+ceil(5*1*0.6)=7+3=10)", () => assert.equal(slime.HP, 10))

console.log("== MC好成: 召唤先行(删 nextTurn 字段后初始=act[0]) ==")
const boss = createMob("MC好成", { level: 1 })
check("初始 nextTurn = 召唤技能(act[0])", () => {
  assert.equal(boss.nextTurn, "skill_mob_summonScapegoat")
  assert.deepEqual(boss.act, ["skill_mob_summonScapegoat", "skill_shared_attack"])
})

console.log("== 暴怒偏好: 满血不触发, 残血触发 ==")
const k2 = createMob("青春生骑士", { level: 1 })
check("满血: 偏好 undefined -> fallback act(数组循环, 创建时已掷 act[0])", () => {
  assert.equal(rollNextTurn(k2), "skill_shared_defend") // 创建时掷了 attack(actIndex=1), 下一击 defend
  assert.equal(k2._prefAct, false)
})
const k3 = createMob("青春生骑士", { level: 1 })
k3.HP = 2 // maxHP 10, 1/4 = 2.5, 2 < 2.5 触发
const prefAct = rollNextTurn(k3)
check("残血(HP2 < maxHP/4): 返回生气技能, _prefAct 标记", () => {
  assert.equal(prefAct, "skill_mob_anger")
  assert.equal(k3._prefAct, true)
  assert.equal(k3.blackList.anger, 3) // 自行写入禁用表
})
runSkill(prefAct, buildSkillCtx({ source: k3, actor: k3, target: player, targetIndex: null, playerInfo: player, mobList: [k3], handPool: [], drawPool: [] }))
check("生气: power 2 -> 4(永久+2)", () => assert.equal(k3.power, 4))

console.log("== 暴怒禁用: 触发后 3 回合禁用, 第 4 回合可再触发 ==")
const k4 = createMob("青春生骑士", { level: 1 })
k4.HP = 1 // 残血
check("触发暴怒: 返回生气, actIndex 不推进(仍为1)", () => {
  assert.equal(rollNextTurn(k4), "skill_mob_anger")
  assert.equal(k4.actIndex, 1)
})
const seq = []
for (let i = 0; i < 3; i++) seq.push(rollNextTurn(k4))
check("禁用期 3 次 roll 回退 act 循环: defend->heal->attack", () => {
  assert.deepEqual(seq, ["skill_shared_defend", "skill_shared_heal", "skill_shared_attack"])
})
check("禁用期结束: anger 已从禁用表释放", () => assert.equal(k4.blackList.anger, undefined))
check("第 4 次 roll: 暴怒放出, 再触发(重新写入3)", () => {
  assert.equal(rollNextTurn(k4), "skill_mob_anger")
  assert.equal(k4.blackList.anger, 3)
})

console.log("== 偏好 null: 明确无行动(临时注入偏好验证框架) ==")
// 注入一个恒返回 null 的偏好(仅测试用, 用完删除)
const { actionPref_LIB } = await import("./.cache/esm/fun_preferences.mjs")
actionPref_LIB["testNull"] = () => null
const k5 = createMob("青春生骑士", { level: 1 })
k5.sAct = ["testNull"]
check("偏好返回 null -> roll 返回 null(发呆)", () => assert.equal(rollNextTurn(k5), null))
delete actionPref_LIB["testNull"]
const k6 = createMob("青春生骑士", { level: 1 })
k6.sAct = ["不存在的偏好"]
check("偏好未定义 -> 警告并回退 act", () => assert.equal(typeof rollNextTurn(k6), "string"))

console.log("\nALL PASSED: " + pass + " assertions")
