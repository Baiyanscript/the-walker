// smoke27: 战斗流程模块(common/battle/flow.js) —— gacha/summonMob/checkMobDeath/cleanDeath/isWin
// 该模块从 fighting.ux 抽出, 本测试保证其逻辑独立可测、行为与重构前一致
import assert from "node:assert/strict"
import { gacha, summonMob, checkMobDeath, cleanDeath, isWin } from "./.cache/esm/pages/fighting/flow.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

function mkPlayer() {
  return { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0, maxHoldCard: 10, getCardNum: 5, effect: [] }
}

console.log("== gacha(抽卡) ==")
check("正常抽牌: 抽到牌库张数并移除", () => {
  const p = mkPlayer()
  const hand = []
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("淬毒", { level: 1 })]
  const discard = []
  let shuffled = 0
  const n = gacha({ playerInfo: p, handPool: hand, battlePool: pool, discardPool: discard, mobLevel: 1, onShuffle: () => shuffled++ })
  assert.equal(n, 3)
  assert.equal(hand.length, 3)
  assert.equal(pool.length, 0)
  assert.equal(shuffled, 0, "抽牌堆非空不触发洗牌")
})

check("抽牌堆空 -> 洗回弃牌堆并触发 onShuffle", () => {
  const p = mkPlayer()
  const hand = []
  const pool = []
  const discard = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  let shuffled = 0
  const n = gacha({ playerInfo: p, handPool: hand, battlePool: pool, discardPool: discard, mobLevel: 1, onShuffle: () => shuffled++ })
  assert.ok(n >= 1, "从洗回的牌中抽到牌")
  assert.ok(shuffled >= 1, "洗牌回调触发(when_shuffle 由页面分发)")
  assert.equal(discard.length, 0, "弃牌堆已清空")
})

check("双堆全空: 补一张保底卡(exhaust+isFallback)且整轮只补一张", () => {
  const p = mkPlayer()
  const hand = []
  const n = gacha({ playerInfo: p, handPool: hand, battlePool: [], discardPool: [], mobLevel: 1 })
  assert.equal(n, 1)
  assert.equal(hand.length, 1)
  assert.equal(hand[0].isFallback, true, "保底卡标记 isFallback")
  assert.equal(hand[0].exhaust, true, "保底卡打出即销毁")
})

check("手牌已满(10/10): 抽 0 张且不动牌库", () => {
  const p = mkPlayer()
  const hand = Array.from({ length: 10 }, () => createCard("斩击", { level: 1 }))
  const pool = [createCard("持盾", { level: 1 })]
  const n = gacha({ playerInfo: p, handPool: hand, battlePool: pool, discardPool: [], mobLevel: 1 })
  assert.equal(n, 0)
  assert.equal(pool.length, 1, "不抽牌")
})

console.log("== summonMob(召唤) ==")
check("addMob 字符串/对象 + detail 透传", () => {
  const mobs = summonMob({ addMob: ["史莱姆", { key: "哥布林", detail: { level: 3 } }], numOfMob: 0 }, 1)
  assert.equal(mobs.length, 2)
  assert.equal(mobs[0].name, "史莱姆")
  assert.equal(mobs[1].name, "哥布林")
  assert.equal(mobs[1].level, 3)
})

check("非法项跳过 / 非法波次返回空数组", () => {
  assert.equal(summonMob({ addMob: [123, null] }, 1).length, 0, "非法 addMob 项被跳过")
  assert.deepEqual(summonMob(null, 1), [])
  assert.deepEqual(summonMob({}, 1), [])
})

check("numOfMob 随机生成且上限 20", () => {
  const mobs = summonMob({ numOfMob: 999 }, 1)
  assert.ok(mobs.length <= 20)
})

console.log("== checkMobDeath(单怪死亡结算) ==")
check("存活怪: 不触发不移除", () => {
  const mob = createMob("史莱姆", { level: 1 })
  const p = mkPlayer()
  const mobPool = [mob]
  assert.equal(checkMobDeath(mob, { mobPool, playerInfo: p }), false)
  assert.equal(mobPool.length, 1)
})

check("死亡怪: when_death(effect_revive 召唤) + 金币掉落 + 移除", () => {
  const mob = createMob("哥布林", { level: 1 })
  mob.HP = 0
  mob.effect = [{ key: "effect_revive", restTurn: "inf", level: 0 }] // 死后召唤愤怒的骷髅鱼
  const p = mkPlayer()
  const mobPool = [mob]
  const died = checkMobDeath(mob, { mobPool, playerInfo: p, handPool: [], discardPool: [], battlePool: [], drawPool: [] })
  assert.equal(died, true)
  assert.equal(p.goldNum, 2, "rare1 × level1 × 2 通用掉落")
  assert.equal(mobPool.length, 1, "旧怪移除, 召唤的骷髅鱼在场")
  assert.equal(mobPool[0].name, "愤怒的骷髅鱼")
})

console.log("== cleanDeath(批量结算) ==")
check("怪物全灭玩家存活: 触发胜负检查, 不触发失败", () => {
  const mob1 = createMob("史莱姆", { level: 1 }); mob1.HP = 0
  const mob2 = createMob("哥布林", { level: 1 }); mob2.HP = 0
  const p = mkPlayer()
  const mobPool = [mob1, mob2]
  let lost = 0, won = 0
  cleanDeath({ mobPool, playerInfo: p, handPool: [], discardPool: [], battlePool: [], drawPool: [], onPlayerLose: () => lost++, onWinCheck: () => won++ })
  assert.equal(mobPool.length, 0)
  assert.equal(lost, 0)
  assert.equal(won, 1, "胜负检查回调无条件调用(与原 cleanDeath->isWin 顺序一致)")
})

check("玩家死亡: 触发失败回调", () => {
  const p = mkPlayer(); p.HP = 0
  const mob = createMob("史莱姆", { level: 1 })
  let lost = 0
  cleanDeath({ mobPool: [mob], playerInfo: p, handPool: [], discardPool: [], battlePool: [], drawPool: [], onPlayerLose: () => lost++ })
  assert.equal(lost, 1)
})

console.log("== isWin(胜负判定) ==")
check("场上还有怪: 无事发生", () => {
  let summoned = 0, won = 0
  isWin([createMob("史莱姆", { level: 1 })], 0, [{ numOfMob: 1 }], { onSummonWave: () => summoned++, onWin: () => won++ })
  assert.equal(summoned, 0)
  assert.equal(won, 0)
})

check("清场且有下一波: 回调下一波索引", () => {
  let idx = -1
  isWin([], 0, [{ numOfMob: 1 }, { numOfMob: 2 }], { onSummonWave: (i) => { idx = i }, onWin: () => {} })
  assert.equal(idx, 1)
})

check("清场且无下一波: 胜利", () => {
  let won = 0
  isWin([], 0, [{ numOfMob: 1 }], { onSummonWave: () => {}, onWin: () => won++ })
  assert.equal(won, 1)
})

console.log("\nALL PASSED: " + pass + " assertions")
