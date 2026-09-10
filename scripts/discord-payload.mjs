// Discord 웹훅 페이로드를 만든다. 형식의 근거는 docs/deploy.md §11.3
//
//   쓰는 곳  .github/workflows/_notify.yml
//   실행     node scripts/discord-payload.mjs      (환경변수로 값을 받는다)
//
// ⚠️ 워크플로 안에 인라인으로 두지 않는 이유는 check-forbidden.sh 와 같다.
//    Gemini Code Assist 가 .github/workflows 를 리뷰에서 제외한다 (workflow.md §8.1).
//    여기 있으면 리뷰도 받고 로컬에서 그대로 돌려볼 수도 있다.

const env = (k, d = '') => process.env[k] ?? d;

const TRACK = env('TRACK', '?');
const PHASE = env('PHASE', '?');
const RESULT = env('RESULT', 'success');
const FAILED_STEP = env('FAILED_STEP');
const IMAGE_TAG = env('IMAGE_TAG');
const SHA = env('SHA');
const REPO = env('REPO');
const SERVER = env('SERVER', 'https://github.com');
const RUN_ID = env('RUN_ID');

// deploy.md §11.3 — 색과 판정 문구
const STYLE = {
  failure: { color: 0xef4444, verdict: '실패' },
  warning: { color: 0xf59e0b, verdict: '경고' },
  release: { color: 0x8b5cf6, verdict: '릴리스' },
  success: { color: 0x22c55e, verdict: '성공' },
};
const { color, verdict } = STYLE[RESULT] ?? STYLE.success;

const short = SHA.slice(0, 7);

const fields = [
  { name: '트랙', value: TRACK, inline: true },
  {
    name: '커밋',
    value: short ? `[\`${short}\`](${SERVER}/${REPO}/commit/${SHA})` : '—',
    inline: true,
  },
];

if (FAILED_STEP) fields.push({ name: '실패한 단계', value: FAILED_STEP, inline: false });
if (IMAGE_TAG) fields.push({ name: '이미지 태그', value: `\`${IMAGE_TAG}\``, inline: false });

process.stdout.write(
  JSON.stringify({
    embeds: [
      {
        title: `${TRACK} ${PHASE} ${verdict}`,
        url: `${SERVER}/${REPO}/actions/runs/${RUN_ID}`,
        color,
        fields,
      },
    ],
  }),
);
