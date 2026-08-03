// 장바구니에 담았을 때의 시각적 피드백 두 가지 — 상품 상세(ProductDetailView)와
// 홈/카테고리/이벤트 상세의 그리드 빠른 담기(QtyControl)가 공유해서 쓴다.
// 그리드에는 QtyControl이 여러 개 동시에 떠 있을 수 있어서, 토스트를 각
// 컴포넌트의 React state로 들고 있으면 여러 개가 동시에 뜰 수 있다 — 그래서
// React state가 아니라 문서에 하나뿐인 엘리먼트를 만들어 재사용하는 방식으로
// "화면엔 토스트가 항상 하나만" 규칙을 간단히 지킨다.
import { isPhotoUrl } from "@/components/ProductPhoto";

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showAddedToast(message = "장바구니에 담았습니다.") {
  if (typeof document === "undefined") return;
  if (!toastEl) {
    toastEl = document.createElement("div");
    Object.assign(toastEl.style, {
      position: "fixed",
      left: "50%",
      bottom: "84px",
      transform: "translateX(-50%)",
      zIndex: "9999",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.82)",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "600",
      padding: "10px 16px",
      borderRadius: "10px",
      opacity: "0",
      transition: "opacity 0.2s ease",
      whiteSpace: "nowrap",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  requestAnimationFrame(() => {
    if (toastEl) toastEl.style.opacity = "1";
  });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, 1500);
}

// 담긴 상품 사진이 fromEl(눌린 버튼) 위치에서 헤더의 장바구니 아이콘
// (#header-cart-link)까지 날아가는 것처럼 보이는 잠깐의 애니메이션.
export function flyToCart(fromEl: HTMLElement, photo: string) {
  const target = document.getElementById("header-cart-link");
  if (!target) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = target.getBoundingClientRect();

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    left: `${fromRect.left + fromRect.width / 2 - 16}px`,
    top: `${fromRect.top + fromRect.height / 2 - 16}px`,
    width: "32px",
    height: "32px",
    borderRadius: "9999px",
    overflow: "hidden",
    zIndex: "9999",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    background: "var(--accent-soft, #f7e4d3)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.55s ease",
  } satisfies Partial<CSSStyleDeclaration>);

  if (isPhotoUrl(photo)) {
    const img = document.createElement("img");
    img.src = photo;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(img);
  } else {
    el.textContent = photo;
  }

  document.body.appendChild(el);

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  requestAnimationFrame(() => {
    el.style.transform = `translate(${dx}px, ${dy}px) scale(0.15)`;
    el.style.opacity = "0.15";
  });

  const remove = () => el.remove();
  el.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 700);
}
