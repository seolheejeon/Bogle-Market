"use client";

import { useEffect, useState } from "react";
import { getStoreSettings, updateStoreSettings } from "@/lib/data";
import { EMPTY_STORE_SETTINGS, type StoreSettings } from "@/types";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings>(EMPTY_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStoreSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function save() {
    setError(null);
    if (!settings.bankName.trim() || !settings.accountNumber.trim() || !settings.accountHolder.trim()) {
      setError("은행명/계좌번호/예금주를 모두 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await updateStoreSettings({
        bankName: settings.bankName.trim(),
        accountNumber: settings.accountNumber.trim(),
        accountHolder: settings.accountHolder.trim(),
        inquiryChatUrl: settings.inquiryChatUrl?.trim() || undefined,
        kakaoChannelUrl: settings.kakaoChannelUrl?.trim() || undefined,
        opentalkUrl: settings.opentalkUrl?.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">불러오는 중...</p>;

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[15px] font-bold">설정</p>

      <p className="mb-2 text-[12.5px] font-bold text-text-muted">입금 계좌 정보</p>
      <p className="mb-3 text-[12px] text-text-muted">무통장입금을 고른 손님에게 체크아웃과 주문상세 화면에서 이 계좌가 그대로 보여요.</p>
      <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="은행명 (예: 카카오뱅크)"
          value={settings.bankName}
          onChange={(e) => setSettings((s) => ({ ...s, bankName: e.target.value }))}
        />
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="계좌번호"
          value={settings.accountNumber}
          onChange={(e) => setSettings((s) => ({ ...s, accountNumber: e.target.value }))}
        />
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="예금주"
          value={settings.accountHolder}
          onChange={(e) => setSettings((s) => ({ ...s, accountHolder: e.target.value }))}
        />
      </div>

      <p className="mt-5 mb-2 text-[12.5px] font-bold text-text-muted">고객 문의 · 오픈톡방</p>
      <p className="mb-3 text-[12px] text-text-muted">여기 입력한 링크가 있을 때만 고객 화면(마이페이지)에 해당 버튼이 나타나요. 안 채우면 버튼 자체가 안 보여요.</p>
      <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
        <label className="text-[12.5px] font-semibold text-text-muted">
          문의 오픈채팅 URL
          <input
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="https://open.kakao.com/o/..."
            value={settings.inquiryChatUrl ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, inquiryChatUrl: e.target.value }))}
          />
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          카카오채널 URL <span className="font-normal">(선택)</span>
          <input
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="https://pf.kakao.com/..."
            value={settings.kakaoChannelUrl ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, kakaoChannelUrl: e.target.value }))}
          />
        </label>
        <label className="text-[12.5px] font-semibold text-text-muted">
          보글마켓 오픈톡방 URL
          <input
            className="mt-1 w-full rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
            placeholder="https://open.kakao.com/o/..."
            value={settings.opentalkUrl ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, opentalkUrl: e.target.value }))}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-[12px] font-semibold text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-[12px] font-semibold text-accent-dark">저장했어요.</p>}
      <button onClick={save} disabled={saving} className="mt-3 w-full rounded-[9px] bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
        {saving ? "저장 중..." : "저장하기"}
      </button>
    </div>
  );
}
