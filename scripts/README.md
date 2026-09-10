# scripts

CI 검사 스크립트가 들어간다.

| 파일 | 용도 |
|---|---|
| `check-forbidden.sh` | 금지사항 7종 검사 (`docs/workflow.md` §8 · 부록 C) |

> **`.github/workflows` 밖에 두는 이유** — Gemini Code Assist가 그 디렉터리를 리뷰 대상에서 제외한다. 여기 두면 **검사 로직 자체가 리뷰를 받고 로컬에서도 돈다.**
