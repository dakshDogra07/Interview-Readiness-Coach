/**
 * script.js — Interview page: webcam, recording, timer, and loading animation.
 */

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const form = document.getElementById('answerForm');
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('statusText');
const timerDisplay = document.getElementById('timerDisplay');

let mediaRecorder;
let audioChunks = [];

// ---- Webcam + Microphone setup ----
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        video.srcObject = stream;

        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
    })
    .catch(err => console.error("Webcam/mic error:", err));

// ---- Frame capture setup ----
let capturedFrames = [];
let captureInterval = null;
let isRecording = false;

// ---- Timer ----
let timerInterval = null;
let recordingStartTime = null;

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function startTimer() {
    recordingStartTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        if (timerDisplay) {
            timerDisplay.textContent = formatTime(elapsed);
        }
    }, 100);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function captureFrame() {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameData = canvas.toDataURL('image/jpeg', 0.5);
    capturedFrames.push(frameData);
}

// ---- Record button: start/stop everything together ----
recordBtn.addEventListener('click', function () {
    const webcamCard = document.getElementById('webcam-card');
    const recordDot = document.getElementById('recordDot');

    if (!isRecording) {
        // Start recording
        audioChunks = [];
        capturedFrames = [];
        mediaRecorder.start();
        isRecording = true;
        recordBtn.textContent = "Stop Recording";
        statusText.textContent = "Recording...";
        webcamCard.classList.add('is-recording');
        recordDot.classList.add('active');

        captureInterval = setInterval(captureFrame, 500);
        startTimer();

    } else {
        // Stop recording
        mediaRecorder.stop();
        clearInterval(captureInterval);
        isRecording = false;
        recordBtn.textContent = "Start Recording";
        statusText.textContent = `Stopped · ${capturedFrames.length} frames captured`;
        webcamCard.classList.remove('is-recording');
        recordDot.classList.remove('active');
        stopTimer();
    }
});

// ---- Loading animation controller ----
function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    const steps = document.querySelectorAll('.loading-step');
    if (!overlay || !steps.length) return;

    overlay.style.display = 'flex';

    let currentStep = 0;

    function advanceStep() {
        steps.forEach((step, i) => {
            step.classList.remove('active', 'done');
            if (i < currentStep) {
                step.classList.add('done');
            } else if (i === currentStep) {
                step.classList.add('active');
            }
        });

        currentStep++;
        if (currentStep <= steps.length) {
            setTimeout(advanceStep, 2500);
        }
    }

    advanceStep();
}

// ---- Form submit: attach frames + audio ----
form.addEventListener('submit', function (e) {
    e.preventDefault();

    showLoadingOverlay();

    document.getElementById('image_data').value = JSON.stringify(capturedFrames);

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = function () {
        document.getElementById('speech_text').value = reader.result; // base64 audio
        form.submit();
    };
    reader.readAsDataURL(audioBlob);
});