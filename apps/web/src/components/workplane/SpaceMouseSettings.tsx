"use client";

import { t } from "@/lib/i18n";
import { NAVLIB_INFO_URL } from "@/lib/navlib";
import { retrySpaceMouse, setSpaceMouseSettings, useSpaceMouseSettings, useSpaceMouseStatus } from "@/lib/spaceMouseConnection";

/**
 * The SpaceMouse page of the settings. It belongs to this browser, not to a design. How fast the cap moves, which
 * way, and what the buttons do are set in 3DxWare's own settings, where Layerling is listed as a program of its own.
 */
export function SpaceMouseSettings() {
  const status = useSpaceMouseStatus();
  const settings = useSpaceMouseSettings();
  const statusText = !settings.enabled
    ? t("spaceMouse.off")
    : status.state === "connected"
      ? t("spaceMouse.connected", { version: status.serverVersion ?? "" }).trim()
      : status.state === "notFound"
        ? t("spaceMouse.notFound")
        : t("spaceMouse.searching");

  return (
    <>
      <div className="workspace-section-heading">
        <strong>{t("spaceMouse.title")}</strong>
        <span>{t("spaceMouse.hint")}</span>
      </div>
      <label className="workspace-toggle">
        <span className="workspace-toggle-copy">
          <span>{t("spaceMouse.enabled")}</span>
        </span>
        <input type="checkbox" checked={settings.enabled} onChange={(event) => setSpaceMouseSettings({ enabled: event.currentTarget.checked })} />
      </label>
      <p className="workspace-history-note" role="status">{statusText}</p>
      {settings.enabled && status.state !== "connected" ? (
        <div className="property-defaults-actions">
          <button type="button" disabled={status.state === "searching"} onClick={retrySpaceMouse}>{t("spaceMouse.retry")}</button>
        </div>
      ) : null}
      <p className="workspace-history-note">{t("spaceMouse.configureNote")}</p>
      {settings.enabled && status.state === "notFound" ? (
        <p className="workspace-history-note">
          {t("spaceMouse.certNote")}{" "}
          <a href={NAVLIB_INFO_URL} target="_blank" rel="noopener noreferrer">{NAVLIB_INFO_URL}</a>
        </p>
      ) : null}
    </>
  );
}
