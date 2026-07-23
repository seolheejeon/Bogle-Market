# 보글마켓

우리 동네 공동구매 쇼핑몰. Next.js (App Router) + Supabase.

## 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 에서 확인. `.env.local`이 없으면 브라우저 localStorage를 이용한 mock 모드로 동작합니다.

## 환경 변수

`.env.local.example`을 `.env.local`로 복사한 뒤 채워주세요.

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 프로젝트 설정 > API에서 확인. 비어있으면 mock 모드 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss Payments 가맹점 클라이언트 키. 비어있으면 카드/카카오페이도 무통장입금처럼 수동 확인 방식으로 동작 |

Supabase를 처음 연결할 땐 `lib/supabase/schema.sql` → `lib/supabase/seed.sql` 순서로 SQL 편집기에서 실행하세요.

## 배포 (Netlify)

이 저장소에는 `netlify.toml`이 포함되어 있고 `@netlify/plugin-nextjs`로 빌드됩니다.

1. [Netlify](https://app.netlify.com)에서 "Add new site" → "Import an existing project" → 이 GitHub 저장소 선택
2. 빌드 설정은 `netlify.toml`에서 자동으로 읽어옵니다 (`npm run build`)
3. Site settings > Environment variables 에 위 환경 변수들을 등록
4. 배포 후 `main` 브랜치에 push할 때마다 자동으로 재배포됩니다

## 기술 스택

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase (Postgres + Auth) — 미설정 시 localStorage 기반 mock 모드로 자동 전환
- Toss Payments (카드/카카오페이, 선택)
