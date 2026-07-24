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
- 홈: 히어로 배너(상품 사진 원본 비율 그대로 `object-contain` 표시, 자동 슬라이드 + 모바일 스와이프/PC 드래그 전환, 수동 조작 후 자동 슬라이드 자연스럽게 재개), 마감 임박 상품, 인기상품 그리드
- 카테고리: 상단 배송방식 탭(문고리배송/사다드림/택배) + 하위 날짜 chips(가로 스크롤) → 선택한 이벤트 상품만 표시
- 상품 상세: 사진 캐러셀(정사각형 박스 + `object-contain`으로 원본 비율 그대로, 잘림 없음), 원산지/중량/보관법/조리법 표, 설명, **상세설명(긴 스크롤형 이미지+텍스트, 관리자가 작성 가능)**, 수량 선택 + 장바구니 담기
- 장바구니, 체크아웃(무통장입금/카드/카카오페이/인천이음카드 선택), 비회원 체크아웃(주문 조회용 확인번호 4자리 직접 설정)
- 내 주문: 회원은 목록+상세, 비회원은 **이름 + 확인번호 4자리**로 조회 (같은 이름+번호로 낸 주문 전부를 목록으로 보여줌)
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

**상품 상세페이지 장바구니 UX 개선** (`feature/product-detail-cart-ux`)
- +/- 버튼은 더 이상 실제 장바구니를 바로 바꾸지 않고, "몇 개 담을지"를 정하는 로컬 수량 선택값만 바꿈 (최소 1개)
- 실제 장바구니 반영은 "장바구니 담기" 버튼을 눌렀을 때만 일어남 (기존 수량에 더해짐), 누른 뒤에도 `/cart`로 이동하지 않고 같은 페이지에 남아 연속으로 여러 상품을 담기 좋게 함
- 담기 성공 시 "장바구니에 담겼습니다" 토스트(1.8초) + 상품 사진이 헤더 장바구니 아이콘 쪽으로 날아가는 간단한 애니메이션을 보여줌 (`components/Product/ProductDetailView.tsx`의 `flyToCart`)
- 우측 상단 장바구니 개수는 전역 `cart-context` 상태라서 담자마자 즉시 반영됨
- 그리드/이벤트/장바구니 목록의 `QtyControl`(즉시-담기 스테퍼)은 이번 변경 대상이 아니라 기존 그대로 유지 — 상품 상세페이지에만 적용된 변경

**상품 이미지 UX 개선** (`feature/product-image-ux`)
- `components/ProductPhoto.tsx`에 `fit` prop 추가(`cover`(기본) | `contain`) — 상품 상세/홈 히어로처럼 사진 자체가 중요한 곳은 `contain`으로 잘리지 않고 원본 비율 그대로 보이도록, 그리드/장바구니 등 작은 정사각 썸네일은 기존 `cover` 유지
- 상품 상세페이지 대표 이미지 박스를 고정 높이(220px)에서 정사각형(`aspect-square`)으로 변경 — 세로/가로/정사각 사진 모두 자연스럽게 수용
- 홈 히어로 배너: Pointer Events 기반으로 모바일 스와이프 + PC 드래그 지원. 드래그 이동량이 임계치를 넘으면 슬라이드 전환, 넘지 않으면 기존처럼 탭=상품 상세 이동. 자동 슬라이드 타이머는 마지막 슬라이드 변경(자동/수동 무관) 시점부터 다시 카운트되도록 해서 수동 조작 직후 바로 튕기듯 넘어가지 않고 자연스럽게 이어짐

**비회원 주문조회를 이름+확인번호(PIN) 방식으로 변경** (`feature/guest-order-pin`)
- 기존엔 "주문번호 + 전화번호 뒷4자리"였는데, 주문번호를 알려줄 문자/알림 시스템이 없어서 고객이 주문번호를 알기 어려운 문제가 있었음
- 체크아웃 시 비회원이 직접 4자리 확인번호를 정하고, 나중에 "이름 + 확인번호"로 조회 — 전화번호 뒷4자리를 안 쓰는 이유는 아파트 단지 이웃끼리는 서로 이름/전화번호를 알 수도 있어서, 본인만 아는 별도의 PIN이 더 안전하기 때문
- `lookup_guest_orders(name, pin)` RPC로 변경 — 기존엔 주문 1건만 찾았지만, 이제 같은 이름+PIN으로 낸 주문을 전부 최신순으로 보여줌 (여러 번 주문한 비회원도 한 번에 조회 가능)
- `orders.guest_pin` 컬럼 추가

**하단 고정 버튼이 BottomNav에 가려지는 버그 수정** (`fix/sticky-cta-hidden-behind-bottomnav`)
- 상품 상세페이지 "장바구니 담기", 장바구니 페이지 "주문하기" 버튼이 `sticky bottom-0`으로 `<main>` 안에 있었는데, 마찬가지로 `sticky bottom-0`인 하단 탭바(`BottomNav`)와 같은 화면 위치에서 겹쳐서 탭바에 가려지는 문제 발견 (페이지 내용이 길어서 스크롤이 필요한 경우에만 발생, 맨 아래까지 스크롤하면 일시적으로 보임)
- 두 버튼 모두 `fixed` + 탭바 높이만큼 위로 띄우는 방식으로 변경해서 항상 탭바 위에 고정되도록 수정

**인프라**
- Supabase 스키마(`lib/supabase/schema.sql`) + seed 데이터(`lib/supabase/seed.sql`)
- RLS 정책 — `is_admin()` SECURITY DEFINER 함수로 profiles 자기참조 무한재귀 버그 수정
- GitHub 저장소 연결, Netlify 배포 설정 완료
- **GitHub 저장소를 Public으로 전환** — Netlify 무료 플랜의 "private repo 1 contributor" 제한 때문에 배포가 막혀서 전환. 코드에 시크릿 없음(`.env`는 gitignore) 확인 후 진행

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
| `orders` | id, order_number, profile_id, guest_name/phone/pin, recipient_name/phone, address_snapshot, payment_method, status, total | 주문. 게스트는 `profile_id=null`, `guest_pin`은 비회원 주문조회용 4자리 |
| `order_items` | id, order_id, product_id, product_name, price_snapshot, quantity | 주문 상품 스냅샷 |

- `is_admin()` — SECURITY DEFINER 함수. RLS 정책에서 `profiles`를 직접 서브쿼리하면 무한재귀가 나기 때문에 이 함수를 통해서만 관리자 여부를 확인
- `lookup_guest_orders(name, pin)` — 비회원 주문 조회용 RPC (RLS 우회, 인증 불필요), 이름+확인번호 일치하는 주문 전부 반환
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
