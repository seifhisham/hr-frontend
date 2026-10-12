"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  api,
  send,
  type NotificationInbox,
  type NotificationItem,
} from "../../lib/api";
import { Modal } from "./modal";

export function Notifications({
  timezone,
  revision,
  onError,
  onOpen,
}: {
  timezone: string;
  revision: number;
  onError: (error: unknown) => void;
  onOpen?: (view: "requests" | "attendance" | "manager-reviews") => void;
}) {
  const [inbox, setInbox] = useState<NotificationInbox>({
    items: [],
    unreadCount: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    let fetching = false;
    const load = async () => {
      if (document.hidden || fetching) return;
      fetching = true;
      try {
        const result = await api<NotificationInbox>("/notifications");
        if (alive) {
          setInbox(result);
          setLoaded(true);
        }
      } catch (error) {
        if (alive) onError(error);
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("focus", load);
    };
  }, [revision, version, onError]);
  async function read(item: NotificationItem) {
    setBusy(true);
    try {
      await send(
        `/notifications/${encodeURIComponent(item.id)}/read`,
        "PATCH",
        {},
      );
      setVersion((value) => value + 1);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  const items = inbox.items.filter((item) => !unreadOnly || !item.readAt);
  return (
    <>
      <button
        className="button secondary"
        aria-label={`Notifications, ${inbox.unreadCount} unread`}
        onClick={() => setOpen(true)}
      >
        <Bell size={18} />{" "}
        <span className="notification-button-label">Notifications</span>{" "}
        {inbox.unreadCount > 0 && (
          <span className="badge warning">{inbox.unreadCount}</span>
        )}
      </button>
      {open && (
        <Modal
          title={`Notifications (${inbox.unreadCount} unread)`}
          close={() => setOpen(false)}
        >
          <div className="notification-content">
            <div className="request-filters">
              <label>
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(event) => setUnreadOnly(event.target.checked)}
                />{" "}
                Unread only
              </label>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setVersion((value) => value + 1)}
              >
                Refresh
              </button>
            </div>
            {!items.length && (
              <p>{loaded ? "No notifications" : "Loading notifications..."}</p>
            )}
            <ul className="notification-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={item.readAt ? "" : "notification-unread"}
                >
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      timeZone: timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}{" "}
                    · {item.readAt ? "Read" : "Unread"}
                  </small>
                  <div className="notification-actions">
                    {!item.readAt && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void read(item)}
                      >
                        Mark as read
                      </button>
                    )}
                    {onOpen && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          onOpen(
                            item.attendanceId
                              ? "attendance"
                              : item.type === "manager-review-required"
                                ? "manager-reviews"
                                : "requests",
                          );
                          setOpen(false);
                        }}
                      >
                        Open{" "}
                        {item.attendanceId
                          ? "attendance"
                          : item.type === "manager-review-required"
                            ? "manager reviews"
                            : "requests"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </>
  );
}
