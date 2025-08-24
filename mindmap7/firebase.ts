import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAO3rQYW-aTTA_cOpwypk8Yz25_Y349_0U",
  authDomain: "mindmap-2c797.firebaseapp.com",
  projectId: "mindmap-2c797",
  storageBucket: "mindmap-2c797.firebasestorage.app",
  messagingSenderId: "107387445570",
  appId: "1:107387445570:web:a5b9b3fa20f7ccb6a5a8db",
  measurementId: "G-FGFHWH66H6"
};


const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Explicitly export services to be used
export { app, auth, db, storage, googleProvider };

// Export types from compat namespace for use across the app
export type User = firebase.User;
export type WriteBatch = firebase.firestore.WriteBatch;