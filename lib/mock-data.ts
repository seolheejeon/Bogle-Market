import type { CatalogProduct, MarketEventSeed, NotificationItem } from "@/types";

function inMinutes(m: number): string {
  return new Date(Date.now() + m * 60 * 1000).toISOString();
}
function inHours(h: number): string {
  return inMinutes(h * 60);
}

// 카탈로그 상품 — 사진/설명/원산지 등 "내용물"만 담고 이벤트와 무관하게 하나만
// 존재한다. 같은 상품(예: 유정란 20구)이 여러 회차(문고리 1회차/2회차)에
// 걸리더라도 여기엔 한 번만 있고, 아래 이벤트들의 리스팅이 이 id를 재사용한다.
export const MOCK_CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: "octopus",
    emoji: "🐙",
    photos: ["🐙", "🍽️", "🥢"],
    name: "자연산 돌문어 1kg (냉장)",
    origin: "국내산 (통영)",
    weight: "1kg (1~2마리 내외)",
    storage: "0~10°C 냉장보관",
    eat: "끓는 물에 10~30분 삶아 드세요.",
    description:
      "통영 앞바다에서 갓 잡아올린 자연산 돌문어예요.\n쫄깃하고 부드러운 식감이 일품이며, 숙회나 볶음 요리에 잘 어울려요.\n신선도를 위해 냉장 상태로 당일 발송해드립니다.",
  },
  { id: "egg", emoji: "🥚", name: "유정란 20구", origin: "국내산", weight: "20구", storage: "냉장보관" },
  { id: "milk", emoji: "🥛", name: "곰물 (500ml)", origin: "국내산", weight: "500ml", storage: "냉장보관" },
  { id: "soup", emoji: "🍲", name: "삼계탕 (1팩)", origin: "국내산", weight: "1팩", storage: "냉장보관" },
  { id: "fish", emoji: "🐟", name: "시래기 고등어조림 (1팩)", origin: "국내산", weight: "1팩", storage: "냉장보관" },
  { id: "apple", emoji: "🍎", name: "사과 (3kg)", origin: "국내산", weight: "3kg", storage: "상온보관" },
  { id: "potato", emoji: "🥔", name: "감자 (2kg)", origin: "국내산", weight: "2kg", storage: "상온보관" },
  { id: "kimchi", emoji: "🥬", name: "배추김치 (1kg)", origin: "국내산", weight: "1kg", storage: "냉장보관" },
  { id: "tofu", emoji: "🧊", name: "손두부 (2모)", origin: "국내산", weight: "2모", storage: "냉장보관" },
  { id: "pork", emoji: "🥩", name: "꽃삼겹살 500g", origin: "국내산", weight: "500g", storage: "냉장보관" },
  { id: "salad", emoji: "🥗", name: "샐러드 채소믹스", origin: "국내산", weight: "500g", storage: "냉장보관" },
  {
    id: "sosoro",
    emoji: "🥐",
    photos: ["🥐", "📦"],
    name: "성심당 튀김소보로 (5개입)",
    origin: "대전",
    weight: "5개입",
    storage: "상온보관",
    description: "대전 성심당의 대표 메뉴, 튀김소보로예요.\n겉은 바삭하고 속은 촉촉한 크림이 가득 들어있어요.\n대전 현지에서 직접 사다드려서 신선하게 받아보실 수 있어요.",
  },
  { id: "buchu", emoji: "🥖", name: "성심당 부추빵 (3개입)", origin: "대전", weight: "3개입", storage: "상온보관" },
  { id: "kalguksu", emoji: "🍜", name: "대전 칼국수 (2인분)", origin: "대전", weight: "2인분", storage: "냉장보관" },
  { id: "jjim", emoji: "🍗", name: "안동찜닭 (2인분)", origin: "안동", weight: "2인분", storage: "냉장보관" },
  { id: "heotjesabap", emoji: "🥮", name: "안동 헛제사밥", origin: "안동", weight: "1인분", storage: "냉장보관" },
  { id: "peach1", emoji: "🍑", name: "대왕복숭아 (황도, 4kg)", origin: "국내산", weight: "4kg", storage: "상온보관" },
];

export const MOCK_EVENTS: MarketEventSeed[] = [
  {
    id: "flash",
    type: "PARCEL",
    title: "돌문어 1시간 특가!",
    isFlash: true,
    deadlineAt: inMinutes(45),
    deliveryAt: inHours(24),
    notice: "한정 수량 특가 상품이에요. 오늘 당일발송됩니다.",
    products: [{ id: "lst_octopus_flash", eventId: "flash", catalogProductId: "octopus", price: 24900 }],
  },
  {
    id: "door",
    type: "DOOR",
    title: "7/24 문고리배송",
    deadlineAt: inHours(27),
    deliveryAt: inHours(48),
    notice: "현관 앞에 안전하게 배송됩니다.\n부재 시 문 앞, 보관함에 두고 사전 전송드려요.\n아이스팩과 보냉백은 회수해 주세요.",
    products: [
      { id: "lst_egg_door", eventId: "door", catalogProductId: "egg", price: 7900 },
      { id: "lst_milk_door", eventId: "door", catalogProductId: "milk", price: 3900 },
      { id: "lst_soup_door", eventId: "door", catalogProductId: "soup", price: 8900 },
      { id: "lst_fish_door", eventId: "door", catalogProductId: "fish", price: 6900 },
      { id: "lst_apple_door", eventId: "door", catalogProductId: "apple", price: 12900 },
      { id: "lst_potato_door", eventId: "door", catalogProductId: "potato", price: 6900 },
      { id: "lst_kimchi_door", eventId: "door", catalogProductId: "kimchi", price: 9900 },
      { id: "lst_tofu_door", eventId: "door", catalogProductId: "tofu", price: 4900 },
    ],
  },
  {
    id: "door2",
    type: "DOOR",
    title: "7/28 문고리배송",
    deadlineAt: inHours(5 * 24 + 3),
    deliveryAt: inHours(5 * 24 + 27),
    notice: "현관 앞에 안전하게 배송됩니다.\n부재 시 문 앞, 보관함에 두고 사전 전송드려요.",
    products: [
      // 1회차(door)와 같은 카탈로그 상품(egg)을 그대로 재사용 — 예전엔 "egg2"로
      // 새 상품이 하나 더 생겼지만, 이제는 리스팅만 새로 생기고 카탈로그는 공유된다.
      { id: "lst_egg_door2", eventId: "door2", catalogProductId: "egg", price: 7900 },
      { id: "lst_pork_door2", eventId: "door2", catalogProductId: "pork", price: 15900 },
      { id: "lst_salad_door2", eventId: "door2", catalogProductId: "salad", price: 6900 },
    ],
  },
  {
    id: "daejeon",
    type: "GROUP_BUY",
    title: "대전 사다드림 특집",
    deadlineAt: inHours(30),
    deliveryAt: inHours(54),
    notice: "대전 현지에서 직접 사다드리는 특산물이에요. 수량 한정으로 조기 마감될 수 있어요.",
    products: [
      { id: "lst_sosoro_daejeon", eventId: "daejeon", catalogProductId: "sosoro", price: 6500 },
      { id: "lst_buchu_daejeon", eventId: "daejeon", catalogProductId: "buchu", price: 5500 },
      { id: "lst_kalguksu_daejeon", eventId: "daejeon", catalogProductId: "kalguksu", price: 8900 },
    ],
  },
  {
    id: "andong",
    type: "GROUP_BUY",
    title: "안동 사다드림 특집",
    deadlineAt: inHours(9 * 24),
    deliveryAt: inHours(9 * 24 + 24),
    notice: "안동 현지에서 직접 사다드리는 특산물이에요.",
    products: [
      { id: "lst_jjim_andong", eventId: "andong", catalogProductId: "jjim", price: 17900 },
      { id: "lst_heotjesabap_andong", eventId: "andong", catalogProductId: "heotjesabap", price: 9900 },
    ],
  },
  {
    id: "peach",
    type: "PARCEL",
    title: "대왕복숭아 (황도)",
    deadlineAt: inHours(48),
    deliveryAt: inHours(72),
    notice: "신선하게 당일 발송해드립니다.",
    products: [{ id: "lst_peach1_peach", eventId: "peach", catalogProductId: "peach1", price: 32900 }],
  },
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    icon: "🔥",
    title: "1시간 특가 오픈!",
    message: "자연산 돌문어 1kg이(가) 24,900원에 특가로 풀렸어요! 서둘러주세요.",
    linkType: "PRODUCT",
    linkId: "lst_octopus_flash",
    profileId: null,
    createdAt: inMinutes(-5),
  },
  {
    id: "n2",
    icon: "📢",
    title: "사다드림 판매 시작",
    message: "안동 사다드림 특집 판매가 시작됐어요! 주문마감 8/1(토)",
    linkType: "EVENT",
    linkId: "andong",
    profileId: null,
    createdAt: inHours(-1),
  },
  {
    id: "n3",
    icon: "📢",
    title: "문고리배송 오픈",
    message: "7/28 문고리배송이 열렸어요! 주문마감 7/28(화)",
    linkType: "EVENT",
    linkId: "door2",
    profileId: null,
    createdAt: inHours(-24),
  },
  {
    id: "n4",
    icon: "📋",
    title: "보글마켓 공지",
    message: "이용해주셔서 감사합니다. 문의사항은 마이페이지를 통해 남겨주세요.",
    linkType: "NONE",
    profileId: null,
    createdAt: inHours(-72),
  },
];
