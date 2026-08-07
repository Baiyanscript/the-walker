// test/run.mjs
/**
 * 一键运行全部 smoke 测试: node test/run.mjs
 * 先确保副本存在(未转换则自动转换), 再逐个执行 test/smoke*.mjs。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 1. 确保副本最新: 每次运行都重建(避免 src 修改后 .cache 过期导致"假通过")
spawnSync(process.execPath, [path.join(__dirname, "convert.mjs")], { stdio: "inherit" })

// 2. 收集 smoke 文件(按文件名排序)
const files = fs.readdirSync(__dirname)
  .filter(f => /^smoke\d+\.mjs$/.test(f))
  .sort()

if (files.length === 0) {
  console.error("[run] 没有找到 smoke*.mjs 测试文件")
  process.exit(1)
}

let totalPass = 0
let totalFail = 0
for (const f of files) {
  console.log(`\n========== ${f} ==========`)
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" })
  if (r.status === 0) totalPass++
  else totalFail++
}

console.log(`\n========== 汇总: ${totalPass} 通过 / ${totalFail} 失败 ==========`)
process.exit(totalFail > 0 ? 1 : 0)
