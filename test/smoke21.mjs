// smoke21: 需求.md 修复验证——返还滞后(弃牌先于when_nextTurn) + 遗物不重复抽取(exclude)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { fireEffect, addEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { recycleHandToDiscard, refillDrawPool } from "./.cache/esm/common/core/core_draw.mjs"
import { rollRelicCandidates, gainRelic, relic_LIB } from "./.cache/esm/common/data/relics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 需求#1: 返还滞后修复(弃牌先于 when_nextTurn) ==")
check("nextTurn 序列: 返还卡从弃牌堆拿回手牌(不复制)", () => {
  const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] }
  const hand = []
  const discard = []
  const borrowed = createCard("衔尾蛇", { level: 1 })

  // 模拟上一回合: 打出衔尾蛇 → 卡进弃牌堆 + 挂返还
  addEffect(player, { key: "effect_return", restTurn: 1, level: 1, isRemove: false, card: borrowed })
  discard.push(borrowed)

  // 模拟 nextTurn 新序列(需求.md bug#1): ①先弃牌 ②再触发 when_nextTurn(注入 discardPool)
  recycleHandToDiscard(hand, discard) // ① 本回合结束时手牌全弃(此处手牌为空)
  fireEffect({ trigger: "when_nextTurn", targets: player, mobList: [], playerInfo: player, handPool: hand, discardPool: discard }) // ② 返还: 从弃牌堆拿回手牌
  assert.equal(hand.length, 1, "返还的卡应回到手牌")
  assert.equal(hand[0], borrowed)
  assert.equal(discard.length, 0, "卡从弃牌堆移除, 无复制")
})
check("对照: 若先触发返还再弃牌, 卡会被立刻弃掉(旧 bug 行为)", () => {
  const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] }
  const hand = []
  const discard = []
  const borrowed = createCard("衔尾蛇", { level: 1 })
  addEffect(player, { key: "effect_return", restTurn: 1, level: 1, isRemove: false, card: borrowed })

  // 旧序列: 先 when_nextTurn(回手) 再弃牌 → 卡被弃掉
  fireEffect({ trigger: "when_nextTurn", targets: player, mobList: [], playerInfo: player, handPool: hand })
  assert.equal(hand.length, 1)
  recycleHandToDiscard(hand, discard)
  assert.equal(hand.length, 0, "旧行为: 返还的卡被弃牌清走")
  assert.equal(discard.length, 1)
})
check("死亡返还: 从弃牌堆拿回手牌(防复制)", () => {
  const player = { HP: 0, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] }
  const hand = []
  const discard = []
  const cube = createCard("非欧立方", { level: 1 })
  addEffect(player, { key: "effect_deathReturn", restTurn: "inf", level: 1, isRemove: false, card: cube })
  discard.push(cube) // 模拟卡已被打出(在弃牌堆)
  fireEffect({ trigger: "when_death", targets: player, mobList: [], playerInfo: player, handPool: hand, discardPool: discard })
  assert.equal(hand.length, 1)
  assert.equal(hand[0], cube)
  assert.equal(discard.length, 0, "弃牌堆中不再有该卡")
})
check("返还的卡下回合结束仍正常进弃牌堆(尖塔语义)", () => {
  const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] }
  const hand = []
  const discard = []
  const borrowed = createCard("衔尾蛇", { level: 1 })
  addEffect(player, { key: "effect_return", restTurn: 1, level: 1, isRemove: false, card: borrowed })

  // 新序列: 弃牌 → when_nextTurn 回手
  recycleHandToDiscard(hand, discard)
  fireEffect({ trigger: "when_nextTurn", targets: player, mobList: [], playerInfo: player, handPool: hand })
  assert.equal(hand.length, 1)
  // 玩家未打出, 下一回合开始时弃牌 → 返还的卡进弃牌堆(之后可被洗回)
  recycleHandToDiscard(hand, discard)
  assert.equal(hand.length, 0)
  assert.equal(discard.length, 1)
  assert.equal(discard[0], borrowed)
})
check("when_nextTurn 其他效果不受弃牌时机影响(毒)", () => {
  const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] }
  addEffect(player, { key: "effect_toxin", restTurn: 2, level: 1, isRemove: false })
  const hand = [createCard("斩击", { level: 1 })]
  const discard = []
  // 新序列: 弃牌(含手牌) → when_nextTurn(毒结算)
  recycleHandToDiscard(hand, discard)
  fireEffect({ trigger: "when_nextTurn", targets: player, mobList: [], playerInfo: player, handPool: hand })
  assert.equal(player.HP, 98) // 毒 1×2=2
  assert.equal(discard.length, 1) // 手牌正常弃掉
})

console.log("== 需求#3: 遗物不重复抽取(exclude) ==")
check("rollRelicCandidates 排除已拥有", () => {
  const player = { HP: 100, maxHP: 100, effect: [], relics: [] }
  gainRelic(player, "relic_burningBlood")
  gainRelic(player, "relic_lantern")
  const owned = player.relics.map(r => r.key)
  for (let i = 0; i < 20; i++) {
    const list = rollRelicCandidates(3, owned)
    assert.ok(list.length >= 1)
    for (const r of list) {
      assert.ok(!owned.includes(r.key), `候选 ${r.key} 不应是已拥有遗物`)
    }
  }
})
check("已集齐全部遗物: 候选为空", () => {
  const player = { HP: 100, maxHP: 100, effect: [], relics: [] }
  // 全量含 BOSS 专属(limit:["BOSS"] 的铜制核心经 BOSS 来源可见, 需求.md 2026-08-16)
  const all = rollRelicCandidates(99, [], {sources: ["BOSS"]}).map(r => r.key)
  for (const k of all) gainRelic(player, k)
  // 同 slot(戒指)只留最新一个——被替换的旧遗物也视作"已拥有", 候选不得再抽到
  const owned = player.relics.map(r => r.key)
  for (const k of all) {
    const entry = relic_LIB[k]
    if (entry && entry.slot && !owned.includes(k)) owned.push(k)
  }
  assert.equal(rollRelicCandidates(3, owned, {sources: ["BOSS"]}).length, 0)
})
check("排除后候选不重复", () => {
  const list = rollRelicCandidates(5, [])
  const keys = list.map(r => r.key)
  assert.equal(new Set(keys).size, list.length)
})

console.log("\nALL PASSED: " + pass + " assertions")
