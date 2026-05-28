import os
import logging
from typing import Optional, Any

_LOG = logging.getLogger(__name__)

_FIREBASE_INITIALIZED = False
_FIRESTORE_CLIENT = None

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth
    _HAS_FIREBASE_SDK = True
except ImportError:
    firebase_admin = None
    credentials = None
    firestore = None
    auth = None
    _HAS_FIREBASE_SDK = False

def initialize_firebase() -> bool:
    """Initialize Firebase Admin SDK using a service account key or application default credentials.
    Returns True if initialized successfully, False otherwise.
    """
    global _FIREBASE_INITIALIZED, _FIRESTORE_CLIENT
    if _FIREBASE_INITIALIZED:
        return True

    if not _HAS_FIREBASE_SDK:
        _LOG.warning("firebase-admin SDK is not installed or import failed.")
        return False

    # Search for firebase-key.json in root or project directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    key_path = os.path.join(project_root, "firebase-key.json")

    try:
        # Check if already initialized by another thread/module
        if not firebase_admin._apps:
            if os.path.exists(key_path):
                _LOG.info(f"Initializing Firebase with certificate file: {key_path}")
                cred = credentials.Certificate(key_path)
                firebase_admin.initialize_app(cred)
            else:
                _LOG.info("firebase-key.json not found. Initializing Firebase using default application credentials...")
                firebase_admin.initialize_app()
        
        _FIREBASE_INITIALIZED = True
        _FIRESTORE_CLIENT = firestore.client()
        _LOG.info("Firebase Admin SDK successfully initialized.")
        return True
    except Exception as e:
        _LOG.exception("Failed to initialize Firebase Admin SDK. Backend will operate in local/offline fallback mode.")
        _FIREBASE_INITIALIZED = False
        _FIRESTORE_CLIENT = None
        return False

def is_firebase_available() -> bool:
    """Return whether the Firebase backend is fully initialized and ready."""
    if not _FIREBASE_INITIALIZED:
        initialize_firebase()
    return _FIREBASE_INITIALIZED and _FIRESTORE_CLIENT is not None

def verify_google_jwt(id_token: str) -> dict:
    """Verify the Google Auth/Firebase ID Token from the web frontend.
    Returns the decoded token containing user identification if valid.
    """
    if not is_firebase_available():
        raise RuntimeError("Firebase backend is not initialized.")
    
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        _LOG.error(f"JWT Verification failed: {e}")
        raise ValueError(f"Invalid JWT Token: {e}") from e

def upload_session_summary(user_id: str, session_id: str, summary: dict) -> bool:
    """Upload session summary dictionary to Firestore under /users/{user_id}/sessions/{session_id}.
    Returns True if upload succeeds, False otherwise.
    """
    if not is_firebase_available():
        _LOG.warning("Firebase not available for session upload. Local fallback required.")
        return False

    try:
        db = _FIRESTORE_CLIENT
        if db is None:
            db = firestore.client()
            
        # Strip ticks before upload to protect against Firestore 1MB document limits
        clean_summary = dict(summary)
        if "ticks" in clean_summary:
            del clean_summary["ticks"]

        # Upload session document
        doc_ref = db.collection("users").document(user_id).collection("sessions").document(session_id)
        doc_ref.set(clean_summary)
        _LOG.info(f"Successfully uploaded session {session_id} for user {user_id} to Firestore (ticks stripped).")

        # Update parent user lifetime statistics aggregates dynamically
        try:
            sessions_ref = db.collection("users").document(user_id).collection("sessions")
            docs = sessions_ref.stream()
            
            total_duration_secs = 0.0
            total_focus_score_sum = 0.0
            session_count = 0
            total_distractions = 0
            
            for doc in docs:
                data = doc.to_dict()
                total_duration_secs += float(data.get("total_duration_seconds", 0.0))
                total_focus_score_sum += float(data.get("focus_score", 0.0))
                total_distractions += int(data.get("distraction_event_count", 0))
                session_count += 1
                
            lifetime_hours_focused = total_duration_secs / 3600.0
            historical_focus_average = (total_focus_score_sum / session_count) if session_count > 0 else 0.0
            
            user_ref = db.collection("users").document(user_id)
            user_ref.set({
                "lifetime_hours_focused": round(lifetime_hours_focused, 2),
                "historical_focus_average": round(historical_focus_average, 2),
                "total_registered_distractions": total_distractions
            }, merge=True)
            _LOG.info(f"Successfully updated aggregates for user {user_id} on parent document.")
        except Exception as agg_err:
            _LOG.error(f"Error computing parent lifetime aggregates: {agg_err}")

        return True
    except Exception as e:
        _LOG.exception(f"Failed to upload session {session_id} to Firestore.")
        return False
