# PROJECT.md

보글마켓 개발 진행상황과 주요 기획 결정을 기록하는 문서입니다.
**기능이 완료되거나 기획이 바뀔 때마다 이 문서도 함께 업데이트합니다.**

마지막 업데이트: 2026-07-24

---

# 프로젝트 개요

보글마켓은 동네/아파트 단위로 운영되는 공동구매 쇼핑몰입니다. 사장님(전설희)이 문고리배송·사다드림·택배 세 가지 배송 방식으로 이벤트를 열고, 이웃들이 마감 시각 전에 주문하면 정해진 날짜에 한 번에 배송/픽업하는 구조입니다.

원래는 Claude 아티팩트로 만든 정적 HTML 목업(로그인·결제·DB 없음)이었고, 이를 실제 동작하는 웹앱으로 전환하는 작업을 진행 중입니다. GitHub 저장소: [seolheejeon/Bogle-Market](https://github.com/seolheejeon/Bogle-Market)

# 기술 스택

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS v4** — 브랜드 그린 톤 팔레트, `app/globals.css`에 CSS 변수로 정의
- **Supabase** (Postgres + Auth) — 연결 안 되어 있으면 브라우저 localStorage 기반 mock 모드로 자동 전환 (`lib/data.ts`가 두 모드를 모두 처리)
- **Toss Payments** — 카드/카카오페이용으로 예정, 아직 실제 연동 전 (`lib/payments.ts`)
- **Netlify** — 배포 대상, GitHub 연동 + 자동배포 연결됨 (`netlify.toml`, `@netlify/plugin-nextjs`)
- 마스코트: `public/images/bogle.png` (보글이)

# 완료된 기능

**고객 화면**
- 홈: 히어로 배너(상품 사진 확대, 자동 슬라이드), 마감 임박 상품, 인기상품 그리드
- 카테고리: 상단 배송방식 탭(문고리배송/사다드림/택배) + 하위 날짜 chips(가로 스크롤) → 선택한 이벤트 상품만 표시
- 상품 상세: 사진 캐러셀, 원산지/중량/보관법/조리법 표, 설명, **상세설명(긴 스크롤형 이미지+텍스트, 관리자가 작성 가능)**, 수량 선택 + 장바구니 담기
- 장바구니, 체크아웃(무통장입금/카드/카카오페이/인천이음카드 선택), 비회원 체크아웃
- 내 주문: 회원은 목록+상세, 비회원은 주문번호+전화번호 뒷자리로 조회
- 마이페이지: 이메일/비밀번호 로그인·회원가입, 로그아웃
- 알림 목록 (정적)

**관리자 화면 (`/admin`)**
- 이벤트 등록/수정/삭제, 상품 등록/수정/삭제
- 주문 목록: 입금확인(무통장입금·이음카드 수동 확인), 배송상태 변경(입금완료→배송중→배송완료), 주문 취소
- 대시보드: 진행 중 이벤트 수, 입금확인 대기 건수, 오늘 매출

**상품 사진 업로드** (`feature/product-photo-upload`)
- 관리자 상품 등록/수정 폼에 다중 사진 업로드 위젯 추가 (`components/admin/PhotoUploader.tsx`) — 미리보기 썸네일 + 개별 삭제
- `lib/supabase/storage.ts`: Supabase Storage(`product-photos` 버킷, 공개 읽기/관리자만 쓰기)에 실제 업로드, mock 모드에서는 data URL로 대체
- `products.photos` (jsonb 배열) 컬럼 추가, 사진이 있으면 사진을, 없으면 기존 emoji를 대표 이미지로 표시 (`components/ProductPhoto.tsx`의 `isPhotoUrl` 판별)
- 그리드 카드/상품상세 캐러셀/장바구니/이벤트 상세/홈(히어로·마감임박) 등 대표 이미지가 노출되는 모든 화면에 반영

**상품 상세설명 편집기** (`feature/product-detail-editor`)
- 관리자 상품 수정 폼에 `제목`/`본문`/`사진` 블록을 자유롭게 추가·삭제·순서변경(▲▼)할 수 있는 에디터 추가 (`components/admin/DetailBlockEditor.tsx`)
- 사진 블록도 동일한 Storage 업로드 경로(`uploadProductPhoto`) 사용
- `products.detail_blocks` (jsonb) 컬럼 추가, 저장된 블록이 있으면 그것을, 없으면 기존 더미 콘텐츠(`DUMMY_DETAIL_BLOCKS`)를 상품 상세 페이지에 표시

**인프라**
- Supabase 스키마(`lib/supabase/schema.sql`) + seed 데이터(`lib/supabase/seed.sql`)
- RLS 정책 — `is_admin()` SECURITY DEFINER 함수로 profiles 자기참조 무한재귀 버그 수정
- GitHub 저장소 연결, Netlify 배포 설정 완료 (자동배포 대기 중)

# 진행 중인 기능

- **카드/카카오페이 결제**: Toss Payments 키가 없어서 지금은 무통장입금과 동일하게 관리자가 수동으로 확인하는 방식으로 대체 중
- **인천 이음카드 결제**: 온라인 자동결제 연동 방법이 아직 조사되지 않음 (지역화폐 특성상 표준 PG로 처리되지 않을 가능성 높음) → 현재는 수동 확인

# 다음 작업 (TODO)

- [ ] Toss Payments 실제 가맹점 키 연동 (카드/카카오페이 자동결제)
- [ ] 인천 이음카드 온라인 결제 연동 방법 조사
- [ ] 배송지 다중 저장/선택 UI (현재는 최근 1건만 자동 채움)
- [ ] 알림을 실시간/DB 기반으로 전환 (현재는 정적 데이터)
- [ ] 최초 관리자 계정 지정 방법 문서화 (현재는 SQL로 수동 `is_admin = true`)

# UX 결정사항

- **비회원 체크아웃 허용** — 회원가입 없이 주문 가능. 회원의 이점은 배송지 저장 정도로 한정
- **마감 임박 표시 절제** — 빨간색 강조는 마감 1시간 이내인 경우에만, 나머지는 무채색 톤으로 표시 (가독성 우선)
- **카테고리 2단 구성** — 배송방식 탭 아래 날짜 chips, 탭 전환 시 가장 빠른 배송일이 기본 선택됨
- **Hero 배너** — 마스코트(보글이) 대신 실제 판매 상품을 크게(전체 폭의 약 45%) 보여줌. 보글이는 헤더 로고 용도로만 사용
- **결제수단 4종 지원 예정** — 무통장입금(기본, 완성) / 카드 / 카카오페이 / 인천 이음카드. 자동결제 미연동 상태에선 전부 무통장입금과 동일한 수동확인 플로우로 동작
- **상세설명은 확장 가능한 블록 구조** — `{type: "heading"|"text"|"image"}` 배열로 설계, 관리자가 나중에 작성한 콘텐츠를 그대로 얹을 수 있도록 렌더러와 데이터를 분리

# DB 구조

Supabase Postgres, RLS 활성화. 전체 정의는 `lib/supabase/schema.sql` 참고.

| 테이블 | 주요 컬럼 | 설명 |
| --- | --- | --- |
| `profiles` | id(=auth.users.id), email, name, phone, is_admin | 1:1 auth 연동. `is_admin=true`가 관리자 |
| `addresses` | id, profile_id, name, phone, address, is_default | 회원 배송지. `profile_id`가 null이면 게스트(직접 입력) |
| `events` | id, type(DOOR/GROUP_BUY/PARCEL), title, is_flash, deadline_at, delivery_at, notice | 공동구매 회차 |
| `products` | id, event_id, name, price, emoji, image_url, photos(jsonb), detail_blocks(jsonb), origin, weight, storage, description | 이벤트별 상품. `photos`가 실제 업로드 사진 배열(Storage URL), 없으면 `emoji`를 대표 이미지로 사용. `detail_blocks`는 관리자가 작성한 상세설명(제목/본문/사진 블록). `image_url`은 미사용 |
| `orders` | id, order_number, profile_id, guest_name/phone, recipient_name/phone, address_snapshot, payment_method, status, total | 주문. 게스트는 `profile_id=null` |
| `order_items` | id, order_id, product_id, product_name, price_snapshot, quantity | 주문 상품 스냅샷 |

- `is_admin()` — SECURITY DEFINER 함수. RLS 정책에서 `profiles`를 직접 서브쿼리하면 무한재귀가 나기 때문에 이 함수를 통해서만 관리자 여부를 확인
- `lookup_guest_order(order_number, phone_last4)` — 비회원 주문 조회용 RPC (RLS 우회, 인증 불필요)
- 시드 데이터는 고정 UUID(`00000000-...`) 사용, `ON CONFLICT DO NOTHING`이라 재실행해도 안전

# 관리자 기능 계획

**완료**
- 이벤트 CRUD (`/admin/events`, `/admin/events/new`, `/admin/events/[id]`)
- 상품 CRUD (이벤트 상세 화면 내)
- 주문 관리: 상태 변경, 입금확인 (`/admin/orders`)
- 상품 사진 업로드, 상세설명(제목/본문/사진 블록) 편집기
- 개발 모드 전용: 회원가입 시 "관리자 계정으로 만들기" 체크박스 (Supabase 미연결 시에만 노출)

**계획**
- 알림 발송 관리 (이벤트 오픈/마감임박/배송완료 등을 관리자가 직접 트리거)
- 매출/정산 리포트 (현재 대시보드는 오늘 매출만 단순 합산)
- 관리자 계정 초대/권한 관리 UI (현재는 SQL로 수동 처리)
