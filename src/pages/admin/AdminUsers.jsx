import React, { useEffect, useState } from "react";
import { getUsers } from "../../services/meetingService";
import { useLanguage } from "../../contexts/LanguageContext";

export default function AdminUsers() {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <div>
          <h2 style={styles.h2}>{t("admin.users")}</h2>
          <p style={styles.text}>{t("admin.usersDescription")}</p>
        </div>
        <span style={styles.count}>{users.length} kişi</span>
      </div>
      <div style={styles.list}>
        {users.map((user) => (
          <div key={user.id} style={styles.item}>
            <div>
              <strong>{user.displayName || user.email}</strong>
              <div style={styles.sub}>{user.email}</div>
            </div>
            <span style={styles.role}>{user.role}</span>
          </div>
        ))}
        {!users.length ? <p style={styles.text}>{t("admin.noUsers")}</p> : null}
      </div>
    </div>
  );
}

const styles = {
  card: { background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.06)" },
  head: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 },
  h2: { marginTop: 0 },
  text: { color: "#6b7280", margin: "6px 0 0" },
  count: { padding: "0.35rem 0.7rem", borderRadius: 999, background: "#f3f4f6", fontWeight: 700 },
  list: { display: "grid", gap: 10 },
  item: { padding: 14, borderRadius: 14, background: "#f9fafb", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  sub: { color: "#6b7280", marginTop: 4, fontSize: 14 },
  role: { padding: "0.35rem 0.7rem", borderRadius: 999, background: "#e0f2fe", color: "#075985", fontWeight: 700, textTransform: "capitalize" },
};
