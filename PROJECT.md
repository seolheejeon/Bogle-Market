# PROJECT.md

보글마켓 개발 진행상황과 주요 기획 결정을 기록하는 문서입니다.
**기능이 완료되거나 기획이 바뀔 때마다 이 문서도 함께 업데이트합니다.**

마지막 업데이트: 2026-07-24 (주소검색 API 연동 추가)

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
- 장바구니, 체크아웃(무통장입금/카드/카카오페이/인천이음카드 선택), 비회원 체크아웃(주문 조회용 확인번호 4자리 직접 설정). 회원은 기본 배송지가 자동으로 채워지고, 주문 시 배송지를 바꾸면 "이번 주문만" 또는 "기본 배송지로 저장" 중 선택 가능
- 내 주문: 회원은 목록+상세, 비회원은 **이름 + 확인번호 4자리**로 조회 (같은 이름+번호로 낸 주문 전부를 목록으로 보여줌)
- 마이페이지: **아이디/비밀번호**로 로그인·회원가입 (이메일은 사용자에게 노출 안 됨), 로그아웃, 정보 수정(비밀번호/오픈채팅 닉네임/휴대폰번호), **기본 배송지 수정**(Daum 주소검색 → 도로명주소 자동입력 → 상세주소/공동현관 출입방법/배송메모)
- 알림: 읽음/안읽음 상태, 클릭 시 관련 화면(상품/이벤트/주문)으로 자동 이동, 전체읽음/전체삭제/개별삭제, 헤더 종 아이콘에 안읽은 개수 뱃지

**관리자 화면 (`/admin`)**
- 이벤트 등록/수정/삭제, 상품 등록/수정/삭제
- 주문 목록: 입금확인(무통장입금·이음카드 수동 확인), 배송상태 변경(입금완료→배송중→배송완료), 주문 취소
- **고객 관리 (`/admin/customers`)**: 회원별 아이디/오픈채팅 닉네임/휴대폰번호/기본 배송지/주문 건수·최근 주문일 조회
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

**회원가입/로그인을 아이디 기반으로 전면 개편** (`feature/username-auth-structured-address`)
- 오픈채팅으로 유입되는 아파트 공동구매 특성상 이메일 가입은 안 맞아서, **아이디+비밀번호** 방식으로 전환. 이메일은 사용자에게 전혀 안 보이고, Supabase Auth 내부적으로만 `아이디@bogle.internal` 형태로 합성해서 사용 (`lib/auth-context.tsx`)
- 회원가입 시 이름 대신 **오픈채팅 닉네임**을 받음 — 오픈채팅방 고객과 실제 주문자를 매칭하기 위함
- **휴대폰번호는 계정당 1개**로 유일해야 함 (중복가입 방지 + 고객식별 + 배송연락 용도)
- 회원가입 화면에서 아이디 **중복확인** 버튼, 제출 시 휴대폰번호 중복 여부도 확인 — `is_username_taken()` / `is_phone_taken()` SECURITY DEFINER 함수로 RLS를 우회해 "존재 여부"만 안전하게 확인 (`is_admin()`과 같은 패턴)
- **배송지를 구조화된 필드**(아파트명/동/호수/공동현관 출입방법/배송메모(선택))로 받음 — 기존의 자유 텍스트 주소 한 줄 대신. 회원가입 시 입력한 배송지가 그대로 기본 배송지로 저장됨
- 체크아웃 화면에서 기본 배송지가 자동으로 채워지고, 배송지를 수정하면 **"이번 주문만"** 또는 **"기본 배송지로 저장"** 중 선택 가능 (`lib/data.ts`의 `updateAddress`)
- 마이페이지 수정 가능 항목: 비밀번호, 오픈채팅 닉네임, 휴대폰번호, 기본 배송지. 아이디는 변경 불가
- 관리자용 **고객 관리(`/admin/customers`)** 페이지 추가 — 아이디/닉네임/휴대폰/기본배송지/주문건수를 한눈에 조회
- 현재는 회원당 배송지 1개만 구현하지만, `addresses` 테이블 자체는 `profile_id` + `is_default`로 이미 여러 개를 저장할 수 있는 구조라 나중에 다중 배송지 UI만 추가하면 됨
- 카카오 로그인 등 향후 OAuth 확장을 고려해 Supabase Auth를 그대로 유지 (이메일 인증/이메일 비밀번호 찾기는 구현 안 함)
- ⚠️ 이 브랜치가 병합되면 이전에 만들었던 `feature/mypage-profile-address` PR(다중 배송지 추가/삭제 UI)은 데이터 모델이 완전히 달라져서 그대로 머지하면 안 됨 — 폐기 필요

**관리자 상품 등록/수정 UX 개선 + 상품별 배송방식** (`feature/admin-product-ux-delivery-type`)
- 상품 등록/수정을 하나의 폼으로 통합 (`app/admin/events/[id]/page.tsx`의 `ProductFormFields`) — 대표사진/배송방식/상품명/가격/원산지/중량/보관법/상세설명(블록 에디터)까지 전부 작성한 뒤 "저장" 한 번으로 등록·수정. 예전엔 상품을 먼저 "추가"해야만 상세설명을 쓸 수 있었고, 수정 시에는 상세설명만 고칠 수 있었음
- **상품마다 배송방식**(문고리배송/사다드림/택배) 지정 가능 — 소속 이벤트의 배송방식을 기본값으로 하되 상품별로 재정의 가능 (`products.delivery_type`, 비어있으면 이벤트 타입을 그대로 따름)
- **이미지 업로드 UX 대폭 개선** (`components/admin/PhotoUploader.tsx`, `components/admin/DetailBlockEditor.tsx`, `lib/file-drop.ts`)
  - 여러 장 한 번에 선택 시 그 순서대로 업로드
  - 드래그 앤 드롭으로 파일 추가
  - Ctrl+V로 클립보드 이미지 붙여넣기
  - 상세설명 사진 블록: 여러 장 선택/드롭/붙여넣기 시 그 개수만큼 이미지 블록이 순서대로 자동 생성 (예: 10장 선택 → 블록 10개)
  - 대표사진은 ◀▶ 버튼으로, 상세설명 블록은 기존 ▲▼ 버튼으로 순서 변경
- **배송방식에 따라 체크아웃에서 필요한 입력만 표시** — 장바구니에 문고리/사다드림 상품이 하나라도 있으면 공동현관 출입방법 입력란을 보여주고, 택배 상품만 있으면 숨김 (`CheckoutView.tsx`). 주문의 배송지 스냅샷과 관리자 주문 목록도 이 여부를 그대로 반영
- 회원가입 시 공동현관 출입방법을 **필수 항목**으로 변경 (주관식 입력, 버튼 선택 방식 아님)
- 관리자 주문 목록(`/admin/orders`)에 배송지 스냅샷 표시 추가 — 기존엔 주소 자체가 전혀 안 보였음

**알림 시스템 개편** (`feature/notification-system`)
- 알림에 **읽음/안읽음 상태**를 도입 — 안읽은 알림은 강조 표시(연한 배경 + 빨간 점), 알림을 클릭해서 연결 화면으로 이동하면 자동으로 읽음 처리 (`lib/notification-state.ts`)
- 읽음/삭제 상태는 **브라우저별 localStorage로 관리** — 서버에 별도 "읽음" 테이블을 두지 않는 방식. 알림 자체(제목/내용/링크)는 Supabase 모드에선 DB에서, mock 모드에선 localStorage에서 오지만, "내가 읽었는지/지웠는지"는 항상 클라이언트에만 저장됨. 이렇게 하면 회원/비회원/mock모드 구분 없이 동일하게 동작하고 서버 쪽 RLS 표면도 늘어나지 않음
- **딥링크**: 알림의 `linkType`(PRODUCT/EVENT/ORDER/NONE) + `linkId`로 클릭 시 해당 상품 상세/이벤트(문고리·사다드림 오픈 공지)/주문 상세로 바로 이동. `NONE`은 이동 없이 내용만 표시(단순 공지용)
- **알림 관리**: 알림 목록 우측 상단에 전체읽음/전체삭제, 각 항목에 개별삭제 버튼
- **자동 삭제(보관 기간)**: 알림은 생성 후 기본 30일이 지나면 목록/뱃지 계산에서 자동으로 제외됨 (`NOTIFICATION_RETENTION_DAYS` 상수, `isWithinRetention()`) — 실제로 DB에서 지우는 배치 작업은 아니고 "이 기간이 지난 건 안 보여준다"는 필터. 상수 하나만 바꾸면 되는 구조라 나중에 관리자 화면에서 기간을 조정하는 기능을 얹기 쉬움
- **헤더 뱃지**: 종 아이콘에 "🔔 3"처럼 안읽은 개수 표시, 0개면 뱃지 자체를 숨김. 알림 상태가 바뀌면(읽음처리/삭제) 페이지 이동 없이도 즉시 갱신되도록 커스텀 이벤트(`onNotificationStateChange`)로 헤더와 알림 목록 페이지를 연결
- **broadcast vs 개인 알림**: `notifications.profile_id`가 `null`이면 전체 공지(특가/이벤트 오픈 등), 특정 회원 id가 들어있으면 그 회원에게만 보임(배송 시작/완료 등) — 같은 테이블 하나로 두 종류를 구분해서 처리
- **관리자 알림 발송(`/admin/notifications`)**: 제목/내용/아이콘/연결화면을 선택해서 전체 공지 발송. 연결화면을 "상품"으로 고르면 실제 상품 드롭다운에서 골라서 그 상품 상세로 딥링크되는 알림을 만들 수 있음 (이벤트/주문 대상도 동일한 방식)
- **배송 상태 변경 시 자동 알림**: 관리자가 주문을 배송중/배송완료로 바꾸면 그 주문 고객에게만(비회원 주문 제외) "배송이 시작됐어요/완료됐어요" 알림이 자동 생성되고, 클릭하면 해당 주문 상세로 이동 (`app/admin/orders/page.tsx`의 `advance()`)

**주소 입력 방식을 Daum(카카오) 주소검색으로 통일** (`feature/kakao-address-search`)
- 회원가입/마이페이지/체크아웃 세 곳에서 각자 다르게 입력받던 배송지를 공통 컴포넌트(`components/AddressFields.tsx`) 하나로 통일 — "주소검색 버튼 → 도로명주소 자동입력 → 상세주소(동/호 등) 직접입력 → 공동현관 출입방법(필수) → 배송메모(선택)" 순서가 세 화면 모두 동일
- 기존의 "아파트명 직접 입력" 텍스트란은 완전히 제거하고, Daum 우편번호 서비스(`lib/daum-postcode.ts`, `t1.daumcdn.net` 스크립트를 최초 클릭 시 1회만 로드)로 대체. 별도 API 키 없이 쓸 수 있는 공식 CDN이라 환경변수 설정이 필요 없음
- **사용자 입력은 통일하되 내부 저장은 분리**: 주소검색 결과가 공동주택(아파트/오피스텔 등)일 때만 채워지는 `apartmentName`을 사용자가 보거나 입력하지 않는 별도 컬럼으로 저장해서, 관리자가 아파트 단지 단위로 회원/주문을 다룰 수 있게 함 — `Address.apartment` + `dong` + `ho` 세 필드를 `Address.roadAddress`(도로명주소) + `Address.detailAddress`(상세주소, 자유입력) + `Address.apartmentName`(검색 결과에서 추출, 사용자 입력 아님)로 재구성
- 주문에도 주문 시점 배송지의 `apartmentName`을 스냅샷으로 저장(`orders.apartment_name`) — `addressSnapshot`과 마찬가지로 이후 회원이 배송지를 바꿔도 과거 주문의 값은 그대로 남음
- **관리자 아파트별 필터**: 고객 관리(`/admin/customers`)와 주문 관리(`/admin/orders`) 양쪽에 아파트명 드롭다운 필터 추가(회원 주소/주문의 `apartmentName`에서 자동으로 목록 생성)
- **아파트 단위 일괄 배송완료**: 주문 관리에서 특정 아파트로 필터링하면 그 아파트의 "배송중" 주문 개수가 버튼에 표시되고, 누르면 전부 배송완료로 바꾸면서 각 주문 고객에게 배송완료 알림을 한 번에 발송 (`bulkCompleteApartment()` — 개별 처리와 동일한 알림 로직(`notifyStatusChange`)을 재사용)
- 택배배송은 기존과 동일하게 공동현관 출입방법 입력란 자체를 숨김(`AddressFields`의 `showEntranceMethod` prop) — 배송방식별 조건부 로직은 그대로 유지, UI 컴포넌트만 공통화됨
- 향후 "문고리 배송 가능 단지 자동 판별" 같은 기능은 이번에 저장해둔 `roadAddress`/`apartmentName` 컬럼을 그대로 활용하면 되도록 설계 (스키마 변경 없이 확장 가능)

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
- [ ] 알림 보관 기간(현재 하드코딩 30일)을 관리자가 조정할 수 있는 설정 화면
- [ ] 주소검색 결과 기반 문고리배송 가능 단지 자동 판별/배송 가능 지역 체크 (아파트명 컬럼이 이미 있어서 자연스러운 확장)
- [ ] 최초 관리자 계정 지정 방법 문서화 (현재는 SQL로 수동 `is_admin = true`)

# UX 결정사항

- **비회원 체크아웃 허용** — 회원가입 없이 주문 가능. 회원의 이점은 배송지 저장 정도로 한정
- **마감 임박 표시 절제** — 빨간색 강조는 마감 1시간 이내인 경우에만, 나머지는 무채색 톤으로 표시 (가독성 우선)
- **카테고리 2단 구성** — 배송방식 탭 아래 날짜 chips, 탭 전환 시 가장 빠른 배송일이 기본 선택됨
- **Hero 배너** — 마스코트(보글이) 대신 실제 판매 상품을 크게(전체 폭의 약 45%) 보여줌. 보글이는 헤더 로고 용도로만 사용
- **결제수단 4종 지원 예정** — 무통장입금(기본, 완성) / 카드 / 카카오페이 / 인천 이음카드. 자동결제 미연동 상태에선 전부 무통장입금과 동일한 수동확인 플로우로 동작
- **상세설명은 확장 가능한 블록 구조** — `{type: "heading"|"text"|"image"}` 배열로 설계, 관리자가 나중에 작성한 콘텐츠를 그대로 얹을 수 있도록 렌더러와 데이터를 분리
- **주소 검색 팝업은 화면 진입 시 미리 로드(preload)해둔다** — 다음 우편번호 스크립트를 클릭 시점에야 비동기로 불러오면, 로딩을 기다리는 사이 user-gesture가 끊겨서 브라우저 팝업 차단에 걸릴 수 있음. `components/AddressFields.tsx`가 마운트되자마자 `lib/daum-postcode.ts`의 `preloadAddressSearch()`를 호출해두므로, 이 컴포넌트를 쓰는 회원가입/마이페이지/체크아웃 세 화면 모두 별도 처리 없이 동일하게 적용됨 — 클릭 시점엔 스크립트가 이미 로드돼 있어 `openAddressSearch()`가 동기적으로 팝업을 열 수 있음

# DB 구조

Supabase Postgres, RLS 활성화. 전체 정의는 `lib/supabase/schema.sql` 참고.

| 테이블 | 주요 컬럼 | 설명 |
| --- | --- | --- |
| `profiles` | id(=auth.users.id), username(unique), nickname, phone(unique), is_admin | 1:1 auth 연동. 이메일은 auth.users에만 있고 이 테이블엔 없음(사용자에게 절대 노출 안 함). `is_admin=true`가 관리자 |
| `addresses` | id, profile_id, name, phone, zonecode, road_address, apartment_name, detail_address, entrance_method, memo, is_default | 회원 배송지. Daum 주소검색으로만 입력받음 — `road_address`/`zonecode`는 검색 결과 그대로, `apartment_name`은 검색 결과가 공동주택일 때만 채워지는 값(사용자가 입력하는 항목 아님, 관리자 아파트별 필터용), `detail_address`(동/호 등)만 사용자가 직접 입력. 현재는 회원당 1개(기본 배송지)만 쓰지만 `is_default` 덕분에 다중 배송지로 확장 가능. `profile_id`가 null이면 게스트(직접 입력, 체크아웃에서만 스냅샷) |
| `events` | id, type(DOOR/GROUP_BUY/PARCEL), title, is_flash, deadline_at, delivery_at, notice | 공동구매 회차 |
| `products` | id, event_id, name, price, emoji, image_url, photos(jsonb), detail_blocks(jsonb), delivery_type, origin, weight, storage, description | 이벤트별 상품. `photos`가 실제 업로드 사진 배열(Storage URL), 없으면 `emoji`를 대표 이미지로 사용. `detail_blocks`는 관리자가 작성한 상세설명(제목/본문/사진 블록). `delivery_type`이 비어있으면 소속 이벤트의 배송방식을 그대로 따름. `image_url`은 미사용 |
| `orders` | id, order_number, profile_id, guest_name/phone/pin, recipient_name/phone, address_snapshot, apartment_name, payment_method, status, total | 주문. 게스트는 `profile_id=null`, `guest_pin`은 비회원 주문조회용 4자리. `apartment_name`은 주문 시점 배송지의 아파트명 스냅샷(관리자 아파트별 필터/일괄 배송처리용) |
| `order_items` | id, order_id, product_id, product_name, price_snapshot, quantity | 주문 상품 스냅샷 |
| `notifications` | id, profile_id(nullable), icon, title, message, link_type(PRODUCT/EVENT/ORDER/NONE), link_id, created_at | 알림. `profile_id`가 null이면 전체 공지, 값이 있으면 그 회원 전용(배송 시작/완료 등). 읽음/삭제 여부는 DB가 아니라 브라우저 localStorage에서 관리(`lib/notification-state.ts`) |

- `is_admin()` — SECURITY DEFINER 함수. RLS 정책에서 `profiles`를 직접 서브쿼리하면 무한재귀가 나기 때문에 이 함수를 통해서만 관리자 여부를 확인
- `is_username_taken(username)` / `is_phone_taken(phone)` — 회원가입 중복확인용 SECURITY DEFINER 함수. RLS상 남의 프로필은 못 보지만, "존재 여부"만 boolean으로 반환
- `lookup_guest_orders(name, pin)` — 비회원 주문 조회용 RPC (RLS 우회, 인증 불필요), 이름+확인번호 일치하는 주문 전부 반환
- 시드 데이터는 고정 UUID(`00000000-...`) 사용, `ON CONFLICT DO NOTHING`이라 재실행해도 안전

# 관리자 기능 계획

**완료**
- 이벤트 CRUD (`/admin/events`, `/admin/events/new`, `/admin/events/[id]`)
- 상품 CRUD (이벤트 상세 화면 내)
- 주문 관리: 상태 변경, 입금확인 (`/admin/orders`)
- 상품 등록/수정 통합 폼(사진+배송방식+기본정보+상세설명을 한 번에 작성·저장), 이미지 드래그드롭/붙여넣기/다중선택 업로드
- 개발 모드 전용: 회원가입 시 "관리자 계정으로 만들기" 체크박스 (Supabase 미연결 시에만 노출)
- 알림 발송(`/admin/notifications`): 제목/내용/아이콘/연결화면(상품·이벤트·주문)을 선택해서 전체 고객에게 알림 발송. 배송 시작/완료 알림은 주문 상태 변경 시 자동 발송(수동 발송 불필요)

**계획**
- 매출/정산 리포트 (현재 대시보드는 오늘 매출만 단순 합산)
- 관리자 계정 초대/권한 관리 UI (현재는 SQL로 수동 처리)
