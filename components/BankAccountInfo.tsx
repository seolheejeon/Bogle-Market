"use client";

import { useEffect, useState } from "react";
import { getStoreSettings } from "@/lib/data";
import { hasBankAccountInfo, type StoreSettings } from "@/types";

// 무통장입금을 고른 손님에게 실제 입금할 계좌를 보여준다. 체크아웃(결제수단
// 선택 시)과 주문상세(입금대기 상태일 때 재확인용) 양쪽에서 재사용한다.
export function BankAccountInfo() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getStoreSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  if (!hasBankAccountInfo(settings)) {
    return <p className="rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5 text-[12px] text-text-muted">입금 계좌 안내를 준비 중이에요. 오픈채팅으로 문의해 주세요.</p>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(settings!.accountNumber.replace(/-/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없는 환경 — 조용히 무시, 계좌번호는 이미 화면에 보임.
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11.5px] text-text-muted">입금 계좌</p>
        <p className="mt-0.5 truncate text-[13.5px] font-bold">
          {settings.bankName} {settings.accountNumber} ({settings.accountHolder})
        </p>
      </div>
      <button type="button" onClick={copy} className="shrink-0 rounded-[7px] border border-border px-2.5 py-1.5 text-[11.5px] font-semibold">
        {copied ? "복사됨" : "계좌 복사"}
      </button>
    </div>
  );
}
