import * as admin from 'firebase-admin';

// Initialize Firebase Admin (make sure you have FIREBASE_CONFIG or service account setup)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function removeEventNotes() {
  console.log('Starting to remove "notes" field from events collection...');
  
  try {
    const eventsRef = db.collection('events');
    const snapshot = await eventsRef.get();
    
    if (snapshot.empty) {
      console.log('No events found.');
      return;
    }

    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.notes !== undefined) {
        batch.update(doc.ref, {
          notes: admin.firestore.FieldValue.delete()
        });
        count++;
      }
    });

    if (count > 0) {
      console.log(`Found ${count} events with "notes" field. Committing batch update...`);
      await batch.commit();
      console.log('Successfully removed "notes" field from events.');
    } else {
      console.log('No events had a "notes" field.');
    }
  } catch (error) {
    console.error('Error removing event notes:', error);
  }
}

removeEventNotes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
