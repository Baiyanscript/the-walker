// smoke16: act 双模式(数组=actIndex循环遍历 / 对象=加权+黑名单banTime) + markActUsed
import assert from "node:assert/strict"
import { createMob, rollNextTurn, markActUsed } from "./.cache/esm/data/mobs.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 数组模式: 顺序循环遍历(actIndex) ==")
const slime = createMob("史莱姆", { level: 1 }) // act: [attack, heal, slimeAttack]
check("创建时已掷初始行动(act[0]=attack), actIndex 推进到 1", () => {
  assert.equal(slime.nextTurn, "skill_shared_attack")
  assert.equal(slime.actIndex, 1)
})
const seq = [rollNextTurn(slime), rollNextTurn(slime), rollNextTurn(slime), rollNextTurn(slime)]
check("按数组顺序循环: heal->slimeAttack->attack->heal", () => {
  assert.deepEqual(seq, ["skill_shared_heal", "skill_mob_slimeAttack", "skill_shared_attack", "skill_shared_heal"])
})
check("actIndex 回绕为 2(创建后1 + 4步 = 5 % 3)", () => assert.equal(slime.actIndex, 2))

console.log("== 数组模式: 非法 key 跳过且指针推进 ==")
const mixed = createMob("史莱姆", { level: 1, setAct: ["不存在的技能", "skill_shared_attack"] })
const r1 = rollNextTurn(mixed)
const r2 = rollNextTurn(mixed)
check("跳过非法 key: 两次都出攻击, 指针不卡死", () => {
  assert.equal(r1, "skill_shared_attack")
  assert.equal(r2, "skill_shared_attack")
})
const allBad = createMob("史莱姆", { level: 1, setAct: ["坏1", "坏2"] })
check("全部非法 -> null(发呆)", () => assert.equal(rollNextTurn(allBad), null))

console.log("== 对象模式: 加权随机 + 黑名单 ==")
const ace = createMob("王牌", { level: 1 }) // {attack:2, cocktail:1}
check("对象模式实例字段: blackList 空, banTime 默认 undefined(按3)", () => {
  assert.deepEqual(ace.blackList, {})
  assert.equal(ace.banTime, undefined)
})
// 加权: 攻击权重 2, 鸡尾酒权重 1(总 3)
let atkCount = 0
const origRandom = Math.random
Math.random = () => 0.01 // 落点 0.03 -> attack 区间[0,2)
for (let i = 0; i < 300; i++) {
  Math.random = () => 0.01
  if (rollNextTurn(ace) === "skill_shared_attack") atkCount++
}
Math.random = origRandom
check("权重: attack 占 2/3(0.01 落点恒命中 attack)", () => assert.equal(atkCount, 300))

console.log("== markActUsed: 用后禁用 banTime 回合 ==")
const ace2 = createMob("王牌", { level: 1 })
markActUsed(ace2, "skill_card_madCocktail") // 默认 banTime 3
check("黑名单记录: cocktail -> 3", () => assert.equal(ace2.blackList.skill_card_madCocktail, 3))
// 即使随机源恒指向 cocktail 区间, 禁用期间也不出 cocktail
let rollRes = []
Math.random = () => 0.99 // 落点 2.97 -> cocktail 区间[2,3)
for (let i = 0; i < 3; i++) {
  rollRes.push(rollNextTurn(ace2))
}
Math.random = origRandom
check("禁用 3 回合: 3 次 roll 都不出 cocktail", () => {
  assert.ok(rollRes.every(k => k === "skill_shared_attack"))
})
Math.random = () => 0.99
const r4 = rollNextTurn(ace2)
Math.random = origRandom
check("第 4 次 roll 放出: 可被随机到 cocktail", () => assert.equal(r4, "skill_card_madCocktail"))

console.log("== banTime 模板覆盖(龟龟 banTime=2) ==")
const turtle = createMob("龟龟", { level: 1 })
check("龟龟 banTime = 2", () => assert.equal(turtle.banTime, 2))
markActUsed(turtle, "skill_shared_superDefend")
check("黑名单值 = 2", () => assert.equal(turtle.blackList.skill_shared_superDefend, 2))
Math.random = () => 0.01 // 若 superDefend 可被随机到, 落点应命中它(权重1, 区间[0,1))
rollNextTurn(turtle) // -1 -> 1
check("禁用中 roll 不出 superDefend", () => assert.ok(!Object.values(turtle.blackList).includes(0)))
Math.random = origRandom

console.log("== 全部可行动都在黑名单 -> null(什么也不做) ==")
const single = createMob("苦力怕", { level: 1 }) // 数组模式 [boom]
// 构造对象模式单技能怪
const solo = createMob("史莱姆", { level: 1, setAct: { skill_shared_attack: 1 } })
markActUsed(solo, "skill_shared_attack")
Math.random = () => 0.5
check("唯一技能被禁 -> null", () => assert.equal(rollNextTurn(solo), null))
Math.random = origRandom

console.log("== 数组模式不受 markActUsed 影响 ==")
const slime2 = createMob("史莱姆", { level: 1 })
markActUsed(slime2, "skill_shared_heal") // 数组模式: 内部忽略
check("数组模式 markActUsed 无副作用", () => {
  assert.deepEqual(slime2.blackList, {})
  // 创建时已掷出 attack(指针在1), 下一击为 heal
  assert.equal(rollNextTurn(slime2), "skill_shared_heal")
})

console.log("== createMob 对象 act 深拷贝(不共享模板) ==")
const a1 = createMob("王牌", { level: 1 })
a1.act.skill_shared_attack = 99
const a2 = createMob("王牌", { level: 1 })
check("修改实例 act 不污染新实例", () => assert.equal(a2.act.skill_shared_attack, 2))

console.log("\nALL PASSED: " + pass + " assertions")
