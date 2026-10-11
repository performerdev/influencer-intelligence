"use client";

export function LogoutButton() {
  return (
    <button
      className="btn-line h-9 px-4"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/";
      }}
    >
      Log out
    </button>
  );
}
