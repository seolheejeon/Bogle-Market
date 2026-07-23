import type { MarketEvent, NotificationItem } from "@/types";

function inMinutes(m: number): string {
  return new Date(Date.now() + m * 60 * 1000).toISOString();
}
function inHours(h: number): string {
  return inMinutes(h * 60);
}

export const MOCK_EVENTS: MarketEvent[] = [
  {
    id: "flash",
    type: "PARCEL",
    title: "돌문어 1시간 특가!",
    isFlash: true,
    deadlineAt: inMinutes(45),
    deliveryAt: inHours(24),
    notice: "한정 수량 특가 상품이에요. 오늘 당일발송됩니다.",
    products: [
      {
        id: "octopus",
        eventId: "flash",
        emoji: "🐙",
        photos: ["🐙", "🍽️", "🥢"],
        name: "자연산 돌문어 1kg (냉장)",
        price: 24900,
        origin: "국내산 (통영)",
        weight: "1kg (1~2마리 내외)",
        storage: "0~10°C 냉장보관",
        eat: "끓는 물에 10~30분 삶아 드세요.",
        description:
          "통영 앞바다에서 갓 잡아올린 자연산 돌문어예요.\n쫄깃하고 부드러운 식감이 일품이며, 숙회나 볶음 요리에 잘 어울려요.\n신선도를 위해 냉장 상태로 당일 발송해드립니다.",
      },
    ],
  },
  {
    id: "door",
    type: "DOOR",
    title: "7/24 문고리배송",
    deadlineAt: inHours(27),
    deliveryAt: inHours(48),
    notice:
      "현관 앞에 안전하게 배송됩니다.\n부재 시 문 앞, 보관함에 두고 사전 전송드려요.\n아이스팩과 보냉백은 회수해 주세요.",
    products: [
      { id: "egg", eventId: "door", emoji: "🥚", name: "유정란 20구", price: 7900, origin: "국내산", weight: "20구", storage: "냉장보관" },
      { id: "milk", eventId: "door", emoji: "🥛", name: "곰물 (500ml)", price: 3900, origin: "국내산", weight: "500ml", storage: "냉장보관" },
      { id: "soup", eventId: "door", emoji: "🍲", name: "삼계탕 (1팩)", price: 8900, origin: "국내산", weight: "1팩", storage: "냉장보관" },
      { id: "fish", eventId: "door", emoji: "🐟", name: "시래기 고등어조림 (1팩)", price: 6900, origin: "국내산", weight: "1팩", storage: "냉장보관" },
      { id: "apple", eventId: "door", emoji: "🍎", name: "사과 (3kg)", price: 12900, origin: "국내산", weight: "3kg", storage: "상온보관" },
      { id: "potato", eventId: "door", emoji: "🥔", name: "감자 (2kg)", price: 6900, origin: "국내산", weight: "2kg", storage: "상온보관" },
      { id: "kimchi", eventId: "door", emoji: "🥬", name: "배추김치 (1kg)", price: 9900, origin: "국내산", weight: "1kg", storage: "냉장보관" },
      { id: "tofu", eventId: "door", emoji: "🧊", name: "손두부 (2모)", price: 4900, origin: "국내산", weight: "2모", storage: "냉장보관" },
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
      { id: "egg2", eventId: "door2", emoji: "🥚", name: "유정란 20구", price: 7900, origin: "국내산", weight: "20구", storage: "냉장보관" },
      { id: "pork", eventId: "door2", emoji: "🥩", name: "꽃삼겹살 500g", price: 15900, origin: "국내산", weight: "500g", storage: "냉장보관" },
      { id: "salad", eventId: "door2", emoji: "🥗", name: "샐러드 채소믹스", price: 6900, origin: "국내산", weight: "500g", storage: "냉장보관" },
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
      {
        id: "sosoro",
        eventId: "daejeon",
        emoji: "🥐",
        photos: ["🥐", "📦"],
        name: "성심당 튀김소보로 (5개입)",
        price: 6500,
        origin: "대전",
        weight: "5개입",
        storage: "상온보관",
        description:
          "대전 성심당의 대표 메뉴, 튀김소보로예요.\n겉은 바삭하고 속은 촉촉한 크림이 가득 들어있어요.\n대전 현지에서 직접 사다드려서 신선하게 받아보실 수 있어요.",
      },
      { id: "buchu", eventId: "daejeon", emoji: "🥖", name: "성심당 부추빵 (3개입)", price: 5500, origin: "대전", weight: "3개입", storage: "상온보관" },
      { id: "kalguksu", eventId: "daejeon", emoji: "🍜", name: "대전 칼국수 (2인분)", price: 8900, origin: "대전", weight: "2인분", storage: "냉장보관" },
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
      { id: "jjim", eventId: "andong", emoji: "🍗", name: "안동찜닭 (2인분)", price: 17900, origin: "안동", weight: "2인분", storage: "냉장보관" },
      { id: "heotjesabap", eventId: "andong", emoji: "🥮", name: "안동 헛제사밥", price: 9900, origin: "안동", weight: "1인분", storage: "냉장보관" },
    ],
  },
  {
    id: "peach",
    type: "PARCEL",
    title: "대왕복숭아 (황도)",
    deadlineAt: inHours(48),
    deliveryAt: inHours(72),
    notice: "신선하게 당일 발송해드립니다.",
    products: [
      { id: "peach1", eventId: "peach", emoji: "🍑", name: "대왕복숭아 (황도, 4kg)", price: 32900, origin: "국내산", weight: "4kg", storage: "상온보관" },
    ],
  },
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", icon: "🔥", message: "[1시간특가] 자연산 돌문어 1kg이(가) 24,900원에 특가로 풀렸어요! 서둘러주세요.", createdAt: inMinutes(-5) },
  { id: "n2", icon: "📢", message: "[사다드림] 안동 사다드림 특집 판매가 시작됐어요! 주문마감 8/1(토)", createdAt: inHours(-1) },
  { id: "n3", icon: "📢", message: "[문고리배송] 7/28 문고리배송이 열렸어요! 주문마감 7/28(화)", createdAt: inHours(-24) },
  { id: "n4", icon: "🚚", message: "[주문 20250719-045] 배송이 완료되었어요. 확인해보세요!", createdAt: inHours(-72) },
];

export function findProduct(productId: string) {
  for (const event of MOCK_EVENTS) {
    const product = event.products.find((p) => p.id === productId);
    if (product) return { product, event };
  }
  return null;
}

export function findEvent(eventId: string) {
  return MOCK_EVENTS.find((e) => e.id === eventId) ?? null;
}
