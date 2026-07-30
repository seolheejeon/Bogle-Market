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

**Supabase 프로젝트 설정에서 꼭 확인할 것**
- **Authentication → Sign In / Providers → Email → "Confirm email" 끄기** — 이 앱은 아이디만 쓰고 이메일을 안 보여주려고 내부적으로 `아이디@bogle-users.com`이라는, 실제로 아무도 받을 수 없는 가짜 이메일을 씁니다. "Confirm email"이 켜져 있으면 그 가짜 주소로 확인 링크가 가버려서 아무도 가입을 완료할 수 없어요.

**첫 관리자 계정 만들기**
1. 앱에서 평소처럼 회원가입
2. SQL 편집기에서 아래 실행 (아이디는 실제로 가입한 것으로):
   ```sql
   update profiles set is_admin = true where username = '가입한아이디';
   ```
3. 로그아웃 후 다시 로그인하면 관리자 화면(`/admin`)에 들어갈 수 있습니다.

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
