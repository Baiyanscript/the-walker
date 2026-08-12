// smoke12: 固定层数脚本(getLevelScript: 全局/角色合并, 校验失败回退null, rlevel hard展开)
import assert from "node:assert/strict"
import { getLevelScript, preset_LIB } from "./.cache/esm/data/presets.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 全局: 第49层 6个固定入口(含遗物) ==")
const s49 = getLevelScript(49, "战士")
check("49层命中: 6个节点", () => {
  assert.ok(s49)
  assert.equal(s49.nodes.length, 6)
})
check("49层入口类型齐备", () => {
  const keys = s49.nodes.map(n => n.rpushKey).sort()
  assert.deepEqual(keys, ["商店", "获得卡牌", "强化卡牌", "融合卡牌", "篝火", "遗物"].sort())
})
check("49层 rlevel 均为 hard", () => s49.nodes.every(n => n.rlevel === "hard"))

console.log("== 全局: 第50层 BOSS 战 ==")
const s50 = getLevelScript(50, "战士")
check("50层命中: 单节点 BOSS", () => {
  assert.ok(s50)
  assert.equal(s50.nodes.length, 1)
  const node = s50.nodes[0]
  assert.equal(node.exDate.isBoss, true)
  assert.equal(node.mobSet[0].addMob[0].key, "MC好成")
})

console.log("== 角色专属: 富二代少爷第1层必然商店 ==")
const s1Gambler = getLevelScript(1, "富二代少爷")
check("富二代少爷第1层命中: 商店节点", () => {
  assert.ok(s1Gambler)
  assert.deepEqual(s1Gambler.nodes.map(n => n.rpushKey), ["商店"])
})
check("战士第1层未配置 -> null(走随机)", () => assert.equal(getLevelScript(1, "战士"), null))

console.log("== 回退: 未命中层数 / 未知预设 ==")
check("第99层无脚本 -> null", () => assert.equal(getLevelScript(99, "战士"), null))
check("未知预设键: 全局层仍生效(49)", () => {
  const s = getLevelScript(49, "不存在的预设")
  assert.ok(s)
  assert.equal(s.nodes.length, 6)
})
check("未知预设键: 全局未配置层为 null", () => assert.equal(getLevelScript(7, "不存在的预设"), null))

console.log("== 校验: 角色覆盖为非法内容 -> 整层失效回退 null ==")
preset_LIB["战士"].levelScript = { 49: { nodes: [{ rpushKey: "非法事件" }] } }
check("非法 rpushKey -> null", () => assert.equal(getLevelScript(49, "战士"), null))
delete preset_LIB["战士"].levelScript
preset_LIB["战士"].levelScript = { 50: { nodes: [] } }
check("空 nodes -> null", () => assert.equal(getLevelScript(50, "战士"), null))
delete preset_LIB["战士"].levelScript
preset_LIB["战士"].levelScript = { 50: { nodes: [{ rpushKey: "商店", mobSet: [{ addMob: [{ key: "不存在的怪" }] }] }] } }
check("addMob 指向不存在怪物 -> null", () => assert.equal(getLevelScript(50, "战士"), null))
delete preset_LIB["战士"].levelScript
check("清理后恢复: 49层全局正常", () => {
  const s = getLevelScript(49, "战士")
  assert.ok(s)
  assert.equal(s.nodes.length, 6)
})

console.log("\nALL PASSED: " + pass + " assertions")
