"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StoredUser = {
  id: number;
  username: string;
  email: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const storedUser = window.localStorage.getItem("worldbuilding-user");

    if (!storedUser) {
      router.replace("/");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser) as StoredUser;
      queueMicrotask(() => setUser(parsedUser));
    } catch {
      window.localStorage.removeItem("worldbuilding-user");
      router.replace("/");
    }
  }, [router]);

  if (!user) {
    return <main className="app-loading">Loading profile…</main>;
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <p className="eyebrow">Worldbuilder profile</p>
        <h1>{user.username}</h1>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{user.id}</dd>
          </div>
        </dl>
        <Link href="/home">← Back to home</Link>
      </section>
    </main>
  );
}
