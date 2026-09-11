# scripts

CI 검사 스크립트가 들어간다.

| 파일 | 용도 |
|---|---|
| `check-forbidden.sh` | 금지사항 7종 검사 (`docs/workflow.md` §8 · 부록 B) · ✅ 2026-09-10 |
| `discord-payload.mjs` | Discord 알림 페이로드 생성 (`docs/deploy.md` §11.3) · ✅ 2026-09-10 |

```bash
./scripts/check-forbidden.sh      # 0 = 통과 · 1 = 위반
```

**PR 을 올리기 전에 로컬에서 한 번 돌린다.** CI 가 돌리는 것과 같은 파일이다.

> **`.github/workflows` 밖에 두는 이유** — **로컬에서 그대로 돌려 검증할 수 있다.** PR을 올리기 전에 한 번 돌리면 CI를 기다릴 일이 없고, 검사 로직이 맞는지를 픽스처로 확인할 수도 있다 (`workflow.md` 부록 B.5).
>
> 나중에 코드 리뷰 봇을 붙이면 이득이 하나 더 붙는다 — 봇은 흔히 `.github/workflows`를 리뷰 대상에서 제외한다.
