// randomUUID 도 네이티브다. 형태만 같으면 된다.
let n = 0
module.exports = {
  randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
}
