import admin from "firebase-admin";

const DEFAULT_SCHOOL = "TED Bursa Koleji";
const DEFAULT_EVENT = "Veli Toplantısı Portalı";
const DEFAULT_NOTES_EMAIL = "bilgi@tedbursa.k12.tr";
const DEFAULT_LANDING_HELP =
  "Toplantı kodunuzu girerek öğrenci arama ve görüşme listesine ulaşabilirsiniz.";
const DEFAULT_LANDING_NOTE =
  "Yardıma ihtiyacınız olursa girişteki görevli sizi doğru öğrenci sayfasına yönlendirebilir.";

function getServiceAccount() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_VELI_TOPLANTISI ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    "";

  if (!raw) {
    throw new Error("Missing Firebase service account JSON in env.");
  }

  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function initAdmin() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

function normalizeSchoolUpdate(data) {
  const next = {
    updatedAt: new Date().toISOString(),
  };

  if (data.school !== DEFAULT_SCHOOL) {
    next.school = DEFAULT_SCHOOL;
  }
  if (data.evtName === "Oakwood Academy") {
    next.evtName = DEFAULT_EVENT;
  }
  if (!data.notesEmail || data.notesEmail === "info@oakwoodacademy.com") {
    next.notesEmail = DEFAULT_NOTES_EMAIL;
  }
  if (!data.landingHelpText) {
    next.landingHelpText = DEFAULT_LANDING_HELP;
  }
  if (!data.landingNoteText) {
    next.landingNoteText = DEFAULT_LANDING_NOTE;
  }

  return next;
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const snapshot = await db.collection("events").get();

  if (snapshot.empty) {
    console.log("No events found in Firestore.");
    return;
  }

  const batch = db.batch();
  let updated = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const next = normalizeSchoolUpdate(data);
    const hasChange = Object.keys(next).some((key) => key === "updatedAt" || data[key] !== next[key]);
    if (hasChange) {
      batch.set(docSnap.ref, next, { merge: true });
      updated += 1;
    }
  });

  if (updated === 0) {
    console.log("No Firestore event docs needed changes.");
    return;
  }

  await batch.commit();
  console.log(`Updated ${updated} Firestore event doc${updated === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
