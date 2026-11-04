import { api } from "@/app/lib/api";

export async function openFeeReceipt(transactionId: number) {
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("Allow pop-ups to open the receipt.");
  tab.opener = null;
  try {
    const { data } = await api.get<Blob>(`/fees/payments/${transactionId}/receipt`, { responseType: "blob" });
    if (data.type !== "application/pdf") throw new Error("The receipt response is not a PDF.");
    if (tab.closed) return;
    const url = URL.createObjectURL(data);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    tab.location.replace(url);
  } catch (error) {
    tab.close();
    throw error;
  }
}
