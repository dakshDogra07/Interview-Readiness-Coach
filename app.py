
from flask import Flask, render_template, request, Request
import random
import json 
import cv2
import numpy as np
import base64
# pyrefly: ignore [missing-import]
from deepface import DeepFace
from collections import Counter
import joblib
import pandas as pd
from google import genai
from google.genai import types
import os
from dotenv import load_dotenv
load_dotenv()

gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)
class CustomRequest(Request):
    max_form_memory_size = 50 * 1024 * 1024
    max_content_length = 50 * 1024 * 1024
    max_form_parts = 10000

app.request_class = CustomRequest

dt_model = joblib.load("ML/confidence_model.pkl")  


emotion_to_confidence = {
    "happy": "Confident",
    "neutral": "Confident",
    "surprise": "Confident",
    "sad": "Nervous",
    "fear": "Nervous",
    "angry": "Distracted",
    "disgust": "Distracted"
}


questions_data = {
    "HR": [
        "Tell me about yourself.",
        "Why do you want to join this company?",
        "What are your strengths and weaknesses?"
    ],
    "Technical": [
        "Explain OOP concepts.",
        "What is the difference between SQL and NoSQL?",
        "How does a hash table work?"
    ],
    "Behavioral": [
        "Describe a time you faced a conflict at work.",
        "Tell me about a challenge you overcame.",
        "How do you handle pressure?"
    ]
}


def predict_confidence(metrics):
    features = pd.DataFrame([{
        "eye_contact_percentage": metrics["eye_contact_percentage"],
        "look_away_count": metrics["look_away_count"],
        "distraction_duration": metrics["distraction_duration"],
        "session_length": metrics["session_length"]
    }])
    prediction = dt_model.predict(features)[0]
    return prediction




def get_gemini_feedback(question, audio_base64):
    if not audio_base64 or audio_base64.strip() == "":
        return {
            "transcription": "No audio was recorded.",
            "strengths": [],
            "improvements": ["Please ensure your microphone is working and your response is captured."],
            "raw": None
        }
    
    try:
        header, encoded = audio_base64.split(",", 1)
        audio_bytes = base64.b64decode(encoded)
        
        prompt = f"""You are an interview coach. Listen to the audio response and evaluate it.

Question: {question}

Respond in EXACTLY this format (keep the section headers exactly as shown):

[TRANSCRIPTION]
Write what the candidate said, word for word.

[STRENGTHS]
- Bullet point 1
- Bullet point 2

[AREAS TO IMPROVE]
- Bullet point 1
- Bullet point 2
"""
        
        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=[
                prompt,
                types.Part.from_bytes(data=audio_bytes, mime_type="audio/webm")
            ]
        )
        return parse_gemini_response(response.text)
    except Exception as e:
        print("Gemini error:", e)
        return {
            "transcription": "",
            "strengths": [],
            "improvements": [],
            "raw": "Could not generate feedback at this time."
        }


def parse_gemini_response(text):
    """Parse Gemini's structured response into separate components.
    Falls back to raw text if the expected delimiters are missing."""
    result = {
        "transcription": "",
        "strengths": [],
        "improvements": [],
        "raw": None
    }
    
    if "[TRANSCRIPTION]" not in text or "[STRENGTHS]" not in text:
        result["raw"] = text
        return result
    
    try:
        # Split by section headers
        parts = text.split("[TRANSCRIPTION]")
        after_transcription = parts[1] if len(parts) > 1 else ""
        
        parts = after_transcription.split("[STRENGTHS]")
        result["transcription"] = parts[0].strip()
        after_strengths = parts[1] if len(parts) > 1 else ""
        
        parts = after_strengths.split("[AREAS TO IMPROVE]")
        strengths_text = parts[0].strip()
        improvements_text = parts[1].strip() if len(parts) > 1 else ""
        
        # Parse bullet points (lines starting with - or *)
        result["strengths"] = [
            line.lstrip("-*").strip()
            for line in strengths_text.splitlines()
            if line.strip().startswith(("-", "*"))
        ]
        result["improvements"] = [
            line.lstrip("-*").strip()
            for line in improvements_text.splitlines()
            if line.strip().startswith(("-", "*"))
        ]
    except Exception as e:
        print("Gemini response parsing error:", e)
        result["raw"] = text
    
    return result


def decode_frame(base64_string):
    header, encoded = base64_string.split(",", 1)
    img_bytes = base64.b64decode(encoded)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return img


face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

def detect_face(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    
    if len(faces) == 0:
        print("No face found")
        return False
    
    # Frontal face cascade detects when the candidate is looking towards the screen/webcam
    for (x, y, w, h) in faces:
        roi_gray = gray[y:y+h, x:x+w]
        eyes = eye_cascade.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=3)
        print(f"Face found, eyes detected: {len(eyes)}")
        return True
    
    return False 


def analyze_emotions(frames_list):
    emotion_list = []
    
    for frame_b64 in frames_list:
        img = decode_frame(frame_b64)
        try:
            result = DeepFace.analyze(img, actions=['emotion'], enforce_detection=False)
            dominant = result[0]['dominant_emotion']
            print("Frame emotion:", dominant)
            emotion_list.append(dominant)
        except Exception as e:
            print("Emotion detection error on a frame:", e)
            continue


    if len(emotion_list) == 0:
        return "Unknown", {}

    most_common_emotion = Counter(emotion_list).most_common(1)[0][0]
    emotion_confidence = emotion_to_confidence.get(most_common_emotion, "Unknown")
    
    emotion_counts = dict(Counter(emotion_list))
    return emotion_confidence, emotion_counts


def analyze_session(frames_list, seconds_per_frame):
    total_frames = len(frames_list)
    face_detected_count = 0
    look_away_count = 0
    was_looking = True

    for frame_b64 in frames_list:
        img = decode_frame(frame_b64)
        face_found = detect_face(img)

        if face_found:
            face_detected_count += 1
            was_looking = True
        else:
            # Transition from looking to not-looking counts as one look-away event
            if was_looking:
                look_away_count += 1
            was_looking = False

    eye_contact_percentage = (face_detected_count / total_frames) * 100 if total_frames > 0 else 0
    distraction_frames = total_frames - face_detected_count
    distraction_duration = distraction_frames * seconds_per_frame
    session_length = total_frames * seconds_per_frame

    return {
        "eye_contact_percentage": round(eye_contact_percentage, 2),
        "look_away_count": look_away_count,
        "distraction_duration": round(distraction_duration, 2),
        "session_length": round(session_length, 2)
    }



@app.route('/')
def home():
    return render_template('index.html')



@app.route("/interview", methods=["POST"])
def interview():
    category = request.form.get("category")
    question = random.choice(questions_data[category])
    return render_template("interview.html", question=question, category=category)


@app.route("/result", methods=["POST"])
def result():
    image_data_raw = request.form.get("image_data")
    speech_text = request.form.get("speech_text")
    question = request.form.get("question")
    category = request.form.get("category")

    frames_list = json.loads(image_data_raw)
    print("Number of frames received:", len(frames_list))

    metrics = analyze_session(frames_list, seconds_per_frame=0.5)
    print("Session metrics:", metrics)

    dt_confidence = predict_confidence(metrics)
    print("Decision Tree confidence:", dt_confidence)

    emotion_confidence, emotion_counts = analyze_emotions(frames_list)
    print("Emotion-based confidence:", emotion_confidence)

    # Compute emotion percentages for chart display
    total_emotion_frames = sum(emotion_counts.values()) if emotion_counts else 1
    emotion_percentages = {
        emotion: round((count / total_emotion_frames) * 100, 1)
        for emotion, count in emotion_counts.items()
    }

    gemini_feedback = get_gemini_feedback(question, speech_text)
    print("Gemini feedback:", gemini_feedback)

    # gemini_feedback is a dict with keys: transcription, strengths, improvements, raw
    # Calculate overall confidence fusion score
    if dt_confidence == "Confident" or emotion_confidence == "Confident":
        overall_confidence = "Confident"
    elif dt_confidence == "Neutral" or emotion_confidence == "Neutral":
        overall_confidence = "Confident" if metrics.get("eye_contact_percentage", 0) >= 50 else "Neutral"
    else:
        overall_confidence = dt_confidence

    print("Overall merged confidence verdict:", overall_confidence)

    return render_template("result.html", 
                          confidence=overall_confidence, 
                          feedback=gemini_feedback,
                          metrics=metrics,
                          emotion_confidence=emotion_confidence,
                          emotion_counts=emotion_counts,
                          emotion_percentages=emotion_percentages,
                          question=question,
                          category=category)



if __name__ == '__main__':
    app.run(debug=True)