import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    onSnapshot,
    collection,
    query,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.mjs";
import {
    normalizeStudentId,
    buildStudentDocId,
    parseStudentsFromText,
    arrayBufferToBase64
} from "./utils.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.mjs";

const state = {
    db: null,
    auth: null,
    userId: null,
    currentGrade: null,
    currentGroup: null,
    unsubscribeStudents: null,
    unsubscribeTimeTables: null,
    lessonNoteUnsub: null,
    currentStudents: [],
    pdfExtractedStudents: []
};

const firebaseConfig = JSON.parse(typeof window.__firebase_config !== "undefined" ? window.__firebase_config : "{}");
const appId = typeof window.__app_id !== "undefined" ? window.__app_id : "middle-school-console";

// DOM
const gradeTabs = document.querySelectorAll(".grade-tab");
const groupTabs = document.querySelectorAll(".group-tab");
const groupSelector = document.getElementById("group-selector");
const group5Btn = document.getElementById("group-5-btn");
const contentArea = document.getElementById("content-area");
const tableTitle = document.getElementById("table-title");
const userIdDisplay = document.getElementById("userIdDisplay");
const gradebookBody = document.getElementById("gradebook-body");
const loadingPlaceholder = document.getElementById("loading-placeholder");
const addStudentForm = document.getElementById("add-student-form");
const studentNameInput = document.getElementById("student-name");
const studentIdInput = document.getElementById("student-id");
const batchUploadBtn = document.getElementById("batch-upload-btn");
const studentPdfInput = document.getElementById("student-pdf-input");
const timetablePdfInput = document.getElementById("timetable-pdf-input");
const pdfUploadProgress = document.getElementById("pdf-upload-progress");
const pdfPreviewSection = document.getElementById("pdf-preview-section");
const pdfPreviewBody = document.getElementById("pdf-preview-body");
const pdfImportBtn = document.getElementById("pdf-import-btn");
const pdfClearBtn = document.getElementById("pdf-clear-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const timetableList = document.getElementById("timetable-list");
const timetableEmpty = document.getElementById("timetable-empty");
const lessonNoteForm = document.getElementById("lesson-note-form");
const lessonNoteInput = document.getElementById("lesson-note-input");
const lessonNoteStatus = document.getElementById("lesson-note-status");
const lessonNoteReset = document.getElementById("lesson-note-reset");

// Modals
const notificationModal = document.getElementById("notification-modal");
const notificationTitle = document.getElementById("notification-title");
const notificationMessage = document.getElementById("notification-message");
const notificationOkBtn = document.getElementById("notification-ok-btn");
const confirmationModal = document.getElementById("confirmation-modal");
const confirmationTitle = document.getElementById("confirmation-title");
const confirmationMessage = document.getElementById("confirmation-message");
const confirmationCancelBtn = document.getElementById("confirmation-cancel-btn");
const confirmationConfirmBtn = document.getElementById("confirmation-confirm-btn");

notificationOkBtn.addEventListener("click", () => notificationModal.classList.add("hidden"));

function showNotification(title, message) {
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    notificationModal.classList.remove("hidden");
}

function showConfirmation(title, message) {
    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    confirmationModal.classList.remove("hidden");

    return new Promise(resolve => {
        confirmationConfirmBtn.onclick = () => {
            confirmationModal.classList.add("hidden");
            resolve(true);
        };
        confirmationCancelBtn.onclick = () => {
            confirmationModal.classList.add("hidden");
            resolve(false);
        };
    });
}

function getStudentsCollection() {
    if (!state.userId || !state.db) return null;
    return collection(state.db, "artifacts", appId, "users", state.userId, "students");
}

function getTimeTablesCollection() {
    if (!state.userId || !state.db) return null;
    return collection(state.db, "artifacts", appId, "users", state.userId, "timetables");
}

function getLessonNotesDoc() {
    if (!state.userId || !state.db || !state.currentGrade || !state.currentGroup) return null;
    return doc(state.db, "artifacts", appId, "users", state.userId, "lessonNotes", `${state.currentGrade}-${state.currentGroup}`);
}

async function initializeAppLogic() {
    try {
        const app = initializeApp(firebaseConfig);
        state.db = getFirestore(app);
        state.auth = getAuth(app);

        onAuthStateChanged(state.auth, async user => {
            if (user) {
                state.userId = user.uid;
                userIdDisplay.textContent = state.userId;
                batchUploadBtn.disabled = false;
                batchUploadBtn.classList.remove("opacity-50", "cursor-not-allowed");
                fetchStudents();
                subscribeToLessonNotes();
                subscribeToTimeTables();
            } else {
                state.userId = null;
                userIdDisplay.textContent = "Signing in…";
                batchUploadBtn.disabled = true;
                batchUploadBtn.classList.add("opacity-50", "cursor-not-allowed");
                try {
                    if (typeof window.__initial_auth_token !== "undefined" && window.__initial_auth_token) {
                        await signInWithCustomToken(state.auth, window.__initial_auth_token);
                    } else {
                        await signInAnonymously(state.auth);
                    }
                } catch (authError) {
                    console.error("Auth error", authError);
                    showNotification("Authentication error", "Could not sign in. Refresh the page and try again.");
                    userIdDisplay.textContent = "Error";
                }
            }
        });
    } catch (error) {
        console.error("Firebase init error", error);
        showNotification("Initialization error", "Could not load Firebase. Check your configuration.");
    }
}

gradeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        gradeTabs.forEach(t => t.classList.replace("tab-active", "tab-inactive"));
        tab.classList.replace("tab-inactive", "tab-active");
        state.currentGrade = tab.dataset.grade;
        state.currentGroup = null;
        state.currentStudents = [];
        contentArea.classList.add("hidden");
        tableTitle.textContent = "Student list";
        gradebookBody.innerHTML = `<tr><td colspan="11" class="placeholder">Select a group to view students.</td></tr>`;
        groupTabs.forEach(t => t.classList.replace("tab-active", "tab-inactive"));
        groupSelector.classList.remove("hidden");
        if (state.currentGrade === "9") {
            group5Btn.classList.add("hidden");
        } else {
            group5Btn.classList.remove("hidden");
        }
        subscribeToLessonNotes();
        subscribeToTimeTables();
        fetchStudents();
    });
});

groupTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        if (!state.currentGrade) {
            showNotification("Select grade", "Choose a grade before selecting a group.");
            return;
        }
        groupTabs.forEach(t => t.classList.replace("tab-active", "tab-inactive"));
        tab.classList.replace("tab-inactive", "tab-active");
        state.currentGroup = tab.dataset.group;
        contentArea.classList.remove("hidden");
        updateTableTitle();
        fetchStudents();
        subscribeToLessonNotes();
        subscribeToTimeTables();
    });
});

function updateTableTitle() {
    if (!state.currentGrade || !state.currentGroup) {
        tableTitle.textContent = "Student list";
        return;
    }
    const gradeLabel = state.currentGrade === "8" ? "2ASCG" : "3ASCG";
    tableTitle.textContent = `Grade ${state.currentGrade} (${gradeLabel}) / Group ${state.currentGroup}`;
}

function fetchStudents() {
    if (state.unsubscribeStudents) {
        state.unsubscribeStudents();
        state.unsubscribeStudents = null;
    }

    if (!state.currentGrade || !state.currentGroup || !state.userId) {
        gradebookBody.innerHTML = `<tr><td colspan="11" class="placeholder">${state.userId ? "Choose a grade and group." : "Authenticating…"}</td></tr>`;
        return;
    }

    const studentsCollection = getStudentsCollection();
    if (!studentsCollection) return;

    const q = query(studentsCollection, where("grade", "==", state.currentGrade), where("group", "==", state.currentGroup));

    state.unsubscribeStudents = onSnapshot(q, snapshot => {
        const students = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        students.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        state.currentStudents = students;
        renderGradebook(students);
    }, error => {
        console.error("Error fetching students", error);
        showNotification("Data error", "Unable to load student data. Try again later.");
        gradebookBody.innerHTML = `<tr><td colspan="11" class="placeholder">Error loading data.</td></tr>`;
    });
}

function renderGradebook(students) {
    gradebookBody.innerHTML = "";

    if (!students.length) {
        gradebookBody.innerHTML = `<tr><td colspan="11" class="placeholder">No students found. Add manually or import from PDF.</td></tr>`;
        return;
    }

    students.forEach(student => {
        const row = document.createElement("tr");
        row.dataset.studentId = student.id;
        row.innerHTML = createStudentRow(student);
        gradebookBody.appendChild(row);
    });
}

function createStudentRow(student) {
    const marks = student.marks || {};
    const q1 = Number(marks.quiz1) || 0;
    const q2 = Number(marks.quiz2) || 0;
    const part = Number(marks.participation) || 0;
    const hw = Number(marks.homework) || 0;
    const copy = Number(marks.copybook) || 0;
    const disc = Number(marks.discipline) || 0;
    const finalScore = (q1 + q2 + part + hw + copy + disc) / 2;

    return `
        <td class="sticky-col font-medium text-sm text-slate-900">${student.name || ""}</td>
        <td class="text-sm text-slate-500">${student.studentId || "N/A"}</td>
        ${createMarkCell("quiz1", marks.quiz1, 0, 10)}
        ${createMarkCell("quiz2", marks.quiz2, 0, 10)}
        ${createMarkCell("participation", marks.participation, 0, 5)}
        ${createMarkCell("homework", marks.homework, 0, 5)}
        ${createMarkCell("copybook", marks.copybook, 0, 5)}
        ${createMarkCell("discipline", marks.discipline, 0, 5)}
        <td class="final-score-cell">${finalScore.toFixed(2)}</td>
        <td><input type="text" class="obs-input" data-field="observations" value="${student.observations || ""}"></td>
        <td class="text-sm font-medium text-red-600">
            <button class="delete-btn hover:underline">Delete</button>
        </td>
    `;
}

function createMarkCell(field, value = 0, min = 0, max = 10) {
    const safeValue = typeof value === "number" ? value : Number(value) || 0;
    return `<td><input type="number" class="mark-input" data-field="${field}" value="${safeValue}" min="${min}" max="${max}"></td>`;
}

async function handleAddStudent(event) {
    event.preventDefault();
    const name = studentNameInput.value.trim();
    const rawStudentId = studentIdInput.value.trim();
    const normalizedStudentId = normalizeStudentId(rawStudentId);

    if (!name || !normalizedStudentId) {
        showNotification("Missing information", "Both name and student ID are required.");
        return;
    }
    if (!state.currentGrade || !state.currentGroup) {
        showNotification("Select class", "Pick a grade and group before adding students.");
        return;
    }

    try {
        const studentsCollection = getStudentsCollection();
        if (!studentsCollection) throw new Error("Database not ready");
        const docId = buildStudentDocId(state.currentGrade, state.currentGroup, normalizedStudentId);
        if (!docId) throw new Error("Invalid student ID");
        const docRef = doc(studentsCollection, docId);
        const existingDoc = await getDoc(docRef);
        if (existingDoc.exists()) {
            showNotification("Student exists", "A student with this ID is already in this class.");
            return;
        }
        await setDoc(docRef, {
            name,
            studentId: normalizedStudentId,
            grade: state.currentGrade,
            group: state.currentGroup,
            marks: {
                quiz1: 0,
                quiz2: 0,
                participation: 0,
                homework: 0,
                copybook: 0,
                discipline: 0
            },
            observations: ""
        });
        studentNameInput.value = "";
        studentIdInput.value = "";
    } catch (error) {
        console.error("Add student error", error);
        showNotification("Add student failed", error.message || "Unknown error");
    }
}

async function handleMarkUpdate(event) {
    if (event.target.tagName !== "INPUT") return;
    const input = event.target;
    const field = input.dataset.field;
    const row = input.closest("tr");
    if (!field || !row) return;
    const studentDocId = row.dataset.studentId;

    let value = input.value;
    if (input.type === "number") {
        const max = Number(input.max);
        const min = Number(input.min);
        value = Number(value);
        if (value > max) value = max;
        if (value < min) value = min;
        input.value = value;
    }

    try {
        const studentsCollection = getStudentsCollection();
        if (!studentsCollection) throw new Error("Database not ready");
        const studentDocRef = doc(studentsCollection, studentDocId);
        const updateData = field === "observations" ? { observations: value } : { [`marks.${field}`]: value };
        await updateDoc(studentDocRef, updateData);
        input.classList.add("bg-emerald-100");
        setTimeout(() => input.classList.remove("bg-emerald-100"), 1000);
        if (input.type === "number") {
            recalculateFinalForRow(row);
        }
    } catch (error) {
        console.error("Update mark error", error);
        showNotification("Save failed", error.message || "Unable to save the change");
    }
}

async function handleDeleteStudent(event) {
    if (!event.target.classList.contains("delete-btn")) return;
    const row = event.target.closest("tr");
    const studentDocId = row?.dataset.studentId;
    const studentName = row?.querySelector(".sticky-col")?.textContent || "this student";
    if (!studentDocId) return;

    const confirmed = await showConfirmation("Delete student", `Remove \"${studentName}\" from this group? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        const studentsCollection = getStudentsCollection();
        if (!studentsCollection) throw new Error("Database not ready");
        await deleteDoc(doc(studentsCollection, studentDocId));
    } catch (error) {
        console.error("Delete error", error);
        showNotification("Delete failed", error.message || "Unable to delete student");
    }
}

async function handleBatchUpload() {
    const confirmed = await showConfirmation(
        "Batch upload",
        "Upload all 313 students from the prepared dataset? Existing groups won't be duplicated."
    );
    if (!confirmed) return;

    try {
        const studentsCollection = getStudentsCollection();
        if (!studentsCollection) throw new Error("Database not ready");

        const recordsToCreate = [];

        for (const grade of Object.keys(allStudentData)) {
            for (const group of Object.keys(allStudentData[grade])) {
                const students = allStudentData[grade][group];
                for (const student of students) {
                    const normalizedStudentId = normalizeStudentId(student.id);
                    if (!normalizedStudentId) continue;
                    const docId = buildStudentDocId(grade, group, normalizedStudentId);
                    if (!docId) continue;
                    const docRef = doc(studentsCollection, docId);
                    const existingDoc = await getDoc(docRef);
                    if (existingDoc.exists()) continue;
                    recordsToCreate.push({
                        ref: docRef,
                        payload: {
                            name: student.name,
                            studentId: normalizedStudentId,
                            grade,
                            group,
                            marks: {
                                quiz1: 0,
                                quiz2: 0,
                                participation: 0,
                                homework: 0,
                                copybook: 0,
                                discipline: 0
                            },
                            observations: ""
                        }
                    });
                }
            }
        }

        if (!recordsToCreate.length) {
            showNotification("No new students", "Every student from the prepared dataset is already in your database.");
            return;
        }

        const batch = writeBatch(state.db);
        recordsToCreate.forEach(({ ref, payload }) => batch.set(ref, payload));
        await batch.commit();
        showNotification("Upload complete", `Successfully uploaded ${recordsToCreate.length} students.`);
    } catch (error) {
        console.error("Batch upload error", error);
        showNotification("Batch upload failed", error.message || "Unknown error");
    }
}

async function handleStudentPdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!state.currentGrade || !state.currentGroup) {
        showNotification("Select class", "Choose a grade and group before importing a PDF.");
        event.target.value = "";
        return;
    }

    try {
        pdfUploadProgress.classList.remove("hidden");
        const text = await extractTextFromPdf(file);
        const students = parseStudentsFromText(text);
        pdfUploadProgress.classList.add("hidden");

        if (!students.length) {
            showNotification("No students detected", "The PDF could not be parsed. Check the layout or add manually.");
            return;
        }

        state.pdfExtractedStudents = students;
        renderPdfPreview();
    } catch (error) {
        console.error("PDF upload error", error);
        pdfUploadProgress.classList.add("hidden");
        showNotification("PDF processing failed", error.message || "Could not read the PDF file.");
    } finally {
        event.target.value = "";
    }
}

function renderPdfPreview() {
    pdfPreviewBody.innerHTML = "";
    if (!state.pdfExtractedStudents.length) {
        pdfPreviewSection.classList.add("hidden");
        return;
    }
    state.pdfExtractedStudents.forEach(student => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${student.name}</td><td>${student.studentId}</td>`;
        pdfPreviewBody.appendChild(row);
    });
    pdfPreviewSection.classList.remove("hidden");
}

async function importPdfStudents() {
    if (!state.pdfExtractedStudents.length) return;
    if (!state.currentGrade || !state.currentGroup) {
        showNotification("Select class", "Choose a grade and group before importing.");
        return;
    }

    const existingIds = new Set(state.currentStudents.map(s => normalizeStudentId(s.studentId)));
    const newStudents = state.pdfExtractedStudents.filter(student => {
        const normalizedId = normalizeStudentId(student.studentId);
        return normalizedId && !existingIds.has(normalizedId);
    });

    if (!newStudents.length) {
        showNotification("No new students", "All students from this PDF already exist in the roster.");
        return;
    }

    try {
        const studentsCollection = getStudentsCollection();
        if (!studentsCollection) throw new Error("Database not ready");

        const batch = writeBatch(state.db);
        newStudents.forEach(student => {
            const normalizedId = normalizeStudentId(student.studentId);
            if (!normalizedId) return;
            const docId = buildStudentDocId(state.currentGrade, state.currentGroup, normalizedId);
            if (!docId) return;
            const docRef = doc(studentsCollection, docId);
            batch.set(docRef, {
                name: student.name,
                studentId: normalizedId,
                grade: state.currentGrade,
                group: state.currentGroup,
                marks: {
                    quiz1: 0,
                    quiz2: 0,
                    participation: 0,
                    homework: 0,
                    copybook: 0,
                    discipline: 0
                },
                observations: ""
            });
        });

        await batch.commit();
        showNotification("Import complete", `Added ${newStudents.length} students to the roster.`);
        state.pdfExtractedStudents = [];
        renderPdfPreview();
    } catch (error) {
        console.error("Import error", error);
        showNotification("Import failed", error.message || "Unable to import students");
    }
}

function clearPdfPreview() {
    state.pdfExtractedStudents = [];
    renderPdfPreview();
}

async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const pageContent = await page.getTextContent();
        const pageText = pageContent.items.map(item => item.str).join(" ");
        text += `\n${pageText}`;
    }
    return text;
}

function recalculateFinalForRow(row) {
    if (!row) return;
    const markFields = ["quiz1", "quiz2", "participation", "homework", "copybook", "discipline"];
    let total = 0;
    markFields.forEach(field => {
        const input = row.querySelector(`input[data-field="${field}"]`);
        if (input) {
            const value = Number(input.value);
            if (!Number.isNaN(value)) {
                total += value;
            }
        }
    });
    const finalCell = row.querySelector(".final-score-cell");
    if (finalCell) {
        finalCell.textContent = (total / 2).toFixed(2);
    }
}

async function handleTimeTableUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!state.currentGrade || !state.currentGroup) {
        showNotification("Select class", "Choose a grade and group before uploading a time table.");
        event.target.value = "";
        return;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);
        const collectionRef = getTimeTablesCollection();
        if (!collectionRef) throw new Error("Database not ready");

        await addDoc(collectionRef, {
            grade: state.currentGrade,
            group: state.currentGroup,
            fileName: file.name,
            fileData: base64Data,
            uploadedAt: Date.now()
        });
        showNotification("Time table saved", `${file.name} uploaded for Grade ${state.currentGrade} Group ${state.currentGroup}.`);
    } catch (error) {
        console.error("Time table upload error", error);
        showNotification("Upload failed", error.message || "Unable to upload time table");
    } finally {
        event.target.value = "";
    }
}

function subscribeToTimeTables() {
    if (state.unsubscribeTimeTables) {
        state.unsubscribeTimeTables();
        state.unsubscribeTimeTables = null;
    }

    if (!state.currentGrade || !state.currentGroup || !state.userId) {
        renderTimeTables([]);
        return;
    }

    const collectionRef = getTimeTablesCollection();
    if (!collectionRef) return;

    const q = query(collectionRef, where("grade", "==", state.currentGrade), where("group", "==", state.currentGroup));
    state.unsubscribeTimeTables = onSnapshot(q, snapshot => {
        const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })).sort((a, b) => b.uploadedAt - a.uploadedAt);
        renderTimeTables(items);
    });
}

function renderTimeTables(items) {
    timetableList.innerHTML = "";
    if (!items.length) {
        timetableEmpty.classList.remove("hidden");
        return;
    }
    timetableEmpty.classList.add("hidden");
    items.forEach(item => {
        const listItem = document.createElement("li");
        listItem.className = "py-3 flex items-center justify-between gap-3";
        const time = new Date(item.uploadedAt || Date.now());
        const formatted = time.toLocaleString();
        listItem.innerHTML = `
            <div>
                <p class="font-medium text-sm text-slate-900">${item.fileName}</p>
                <p class="text-xs text-slate-500">Uploaded ${formatted}</p>
            </div>
            <div class="flex gap-2">
                <button class="ghost-button text-xs download-timetable" data-id="${item.id}">Download</button>
                <button class="text-xs text-red-600 hover:underline remove-timetable" data-id="${item.id}">Remove</button>
            </div>
        `;
        timetableList.appendChild(listItem);
    });
}

async function downloadTimeTable(docId) {
    const collectionRef = getTimeTablesCollection();
    if (!collectionRef) return;
    try {
        const docSnap = await getDoc(doc(collectionRef, docId));
        if (!docSnap.exists()) {
            showNotification("Not found", "The requested time table could not be located.");
            return;
        }
        const data = docSnap.data();
        const url = `data:application/pdf;base64,${data.fileData}`;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = data.fileName || "timetable.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } catch (error) {
        console.error("Download time table error", error);
        showNotification("Download failed", error.message || "Unable to download time table");
    }
}

async function removeTimeTable(docId) {
    const confirmed = await showConfirmation("Remove time table", "Delete this uploaded PDF? This cannot be undone.");
    if (!confirmed) return;
    try {
        const collectionRef = getTimeTablesCollection();
        if (!collectionRef) throw new Error("Database not ready");
        await deleteDoc(doc(collectionRef, docId));
    } catch (error) {
        console.error("Remove time table error", error);
        showNotification("Delete failed", error.message || "Unable to delete time table");
    }
}

function subscribeToLessonNotes() {
    if (state.lessonNoteUnsub) {
        state.lessonNoteUnsub();
        state.lessonNoteUnsub = null;
    }

    if (!state.currentGrade || !state.currentGroup || !state.userId) {
        lessonNoteInput.value = "";
        lessonNoteStatus.textContent = "";
        return;
    }

    const docRef = getLessonNotesDoc();
    if (!docRef) return;

    state.lessonNoteUnsub = onSnapshot(docRef, snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            lessonNoteInput.value = data.note || "";
            if (data.updatedAt) {
                const date = new Date(data.updatedAt);
                lessonNoteStatus.textContent = `Last saved ${date.toLocaleString()}`;
            } else {
                lessonNoteStatus.textContent = "";
            }
        } else {
            lessonNoteInput.value = "";
            lessonNoteStatus.textContent = "";
        }
    });
}

async function handleLessonNoteSave(event) {
    event.preventDefault();
    if (!state.currentGrade || !state.currentGroup) {
        showNotification("Select class", "Choose a grade and group before saving notes.");
        return;
    }

    try {
        const docRef = getLessonNotesDoc();
        if (!docRef) throw new Error("Database not ready");
        await setDoc(docRef, { note: lessonNoteInput.value.trim(), updatedAt: Date.now() });
        lessonNoteStatus.textContent = `Last saved ${new Date().toLocaleString()}`;
    } catch (error) {
        console.error("Save note error", error);
        showNotification("Save failed", error.message || "Unable to save note");
    }
}

function handleLessonNoteReset() {
    lessonNoteInput.value = "";
}

function exportCsv() {
    if (!state.currentStudents.length) {
        showNotification("No data", "There are no students to export for the selected class.");
        return;
    }
    const headers = [
        "Name",
        "Student ID",
        "Quiz 1",
        "Quiz 2",
        "Participation",
        "Homework",
        "Copybook",
        "Discipline",
        "Final",
        "Observations"
    ];
    const rows = state.currentStudents.map(student => {
        const marks = student.marks || {};
        const q1 = Number(marks.quiz1) || 0;
        const q2 = Number(marks.quiz2) || 0;
        const part = Number(marks.participation) || 0;
        const hw = Number(marks.homework) || 0;
        const copy = Number(marks.copybook) || 0;
        const disc = Number(marks.discipline) || 0;
        const finalScore = (q1 + q2 + part + hw + copy + disc) / 2;
        return [
            `"${(student.name || "").replace(/"/g, '""')}"`,
            `"${(student.studentId || "").replace(/"/g, '""')}"`,
            q1,
            q2,
            part,
            hw,
            copy,
            disc,
            finalScore.toFixed(2),
            `"${(student.observations || "").replace(/"/g, '""')}"`
        ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const gradeLabel = state.currentGrade ? `grade-${state.currentGrade}` : "grade";
    const groupLabel = state.currentGroup ? `group-${state.currentGroup}` : "group";
    link.download = `${gradeLabel}_${groupLabel}_gradebook.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// Event listeners
addStudentForm?.addEventListener("submit", handleAddStudent);
batchUploadBtn?.addEventListener("click", handleBatchUpload);
studentPdfInput?.addEventListener("change", handleStudentPdfUpload);
timetablePdfInput?.addEventListener("change", handleTimeTableUpload);
pdfImportBtn?.addEventListener("click", importPdfStudents);
pdfClearBtn?.addEventListener("click", clearPdfPreview);
lessonNoteForm?.addEventListener("submit", handleLessonNoteSave);
lessonNoteReset?.addEventListener("click", handleLessonNoteReset);
exportCsvBtn?.addEventListener("click", exportCsv);

gradebookBody.addEventListener("change", handleMarkUpdate);
gradebookBody.addEventListener("click", handleDeleteStudent);
timetableList.addEventListener("click", event => {
    const downloadBtn = event.target.closest(".download-timetable");
    const removeBtn = event.target.closest(".remove-timetable");
    if (downloadBtn) {
        downloadTimeTable(downloadBtn.dataset.id);
    } else if (removeBtn) {
        removeTimeTable(removeBtn.dataset.id);
    }
});

document.addEventListener("DOMContentLoaded", initializeAppLogic);

// Static dataset for quick bootstrap
const allStudentData = {
    "8": {
        "1": [
            { name: "سهيل الدقداق", id: "A161048373" },
            { name: "نوفل أمثيو", id: "A161050278" },
            { name: "إسحاق أمزور", id: "A161058468" },
            { name: "سامية ابو حرايت", id: "A162040924" },
            { name: "ليلي أبراري", id: "A165058257" },
            { name: "انصاف احجام", id: "A165061431" },
            { name: "بلال مشبال", id: "A169042611" },
            { name: "هناء الطريح", id: "A171065955" },
            { name: "ادم الهدام", id: "A174067867" },
            { name: "عمر مشبال", id: "A174071449" },
            { name: "وسيمة حميش", id: "A175080094" },
            { name: "موسى عزوز", id: "A175090190" },
            { name: "محمد حميش", id: "A180016224" },
            { name: "لؤي مشبال", id: "A180057192" },
            { name: "حذيفة احداش", id: "A181078782" },
            { name: "فاطمة الزهراء أشوخي", id: "A182054314" },
            { name: "بشری الشكوري", id: "A182054315" },
            { name: "عائشة أقداح", id: "A182054665" },
            { name: "سعيدة حميش", id: "A183075173" },
            { name: "أحلام أقراوش", id: "A183106146" },
            { name: "ادم أقداح", id: "A184054944" },
            { name: "أدم أحداش", id: "A184054945" },
            { name: "اية احداش", id: "A186054947" },
            { name: "وداد حميش", id: "A186078769" },
            { name: "هود امزور", id: "A187055166" },
            { name: "محمد الزكري", id: "A189006471" },
            { name: "ليلي أجنان", id: "A189055124" },
            { name: "إناس الشكوري", id: "A189075170" },
            { name: "عبد الجبار عزوز", id: "P151038451" },
            { name: "احمد بن محمد اقداح", id: "P153044873" },
            { name: "نهاد تزغرت", id: "P154044490" },
            { name: "جواد الدقداق", id: "P158044513" }
        ],
        "2": [
            { name: "يوسف اجنان", id: "A167020400" },
            { name: "عماد محو", id: "A168048376" },
            { name: "خالد عزوز", id: "A170035490" },
            { name: "امال الزموري", id: "A170098959" },
            { name: "مریم ابراري", id: "A171071414" },
            { name: "عادل أجنان", id: "A171071416" },
            { name: "محمد حميش", id: "A173076194" },
            { name: "رميصة حميش", id: "A173090342" },
            { name: "سارة عزوز", id: "A174071407" },
            { name: "بشری محو", id: "A175070255" },
            { name: "أميمة أبو حرايث", id: "A180057538" },
            { name: "ارما البقالي", id: "A180061496" },
            { name: "أسامة الغزاوي", id: "A180061502" },
            { name: "أيوب أبو حرايث", id: "A180061552" },
            { name: "زينب اقداح", id: "A180100545" },
            { name: "محمد الزموري", id: "A181080886" },
            { name: "فطيمة الزهرة أبو حرايث", id: "A182054312" },
            { name: "محمد مولود", id: "A182057537" },
            { name: "آية أبو حرايت", id: "A182057542" },
            { name: "أية البقالي", id: "A182061491" },
            { name: "محمد بن رشید ابري", id: "A184075168" },
            { name: "يوسف أحداش", id: "A185054943" },
            { name: "عبد الصادق حميش", id: "A185100465" },
            { name: "احمد البقالي", id: "A186016222" },
            { name: "سعيد البقالي", id: "A186080655" },
            { name: "سعد أبو حرايث", id: "A187027435" },
            { name: "احمد ابراري", id: "A189055129" },
            { name: "ياسمينة مشبال", id: "P137539721" },
            { name: "عبد الجليل الدقداق", id: "P150044516" },
            { name: "اية البقالي", id: "P153068008" },
            { name: "ايوب اقداح", id: "P155046125" }
        ],
        "3": [
            { name: "سارة اشراو", id: "A161042408" },
            { name: "عبد الرفيع أجنان", id: "A166020401" },
            { name: "اشرف الحياني الشكوري", id: "A170065946" },
            { name: "منال عزوز", id: "A170090731" },
            { name: "مصطفى أريفي", id: "A172098976" },
            { name: "يسرى أشوخي", id: "A173068982" },
            { name: "انس علوذان", id: "A173071458" },
            { name: "أنس أمزور", id: "A173090672" },
            { name: "اسماء عزوز", id: "A174071404" },
            { name: "زكية حميش", id: "A175068973" },
            { name: "ربيع امرنيس", id: "A175095130" },
            { name: "حسام البقالي", id: "A177098981" },
            { name: "ونام مرون", id: "A180047156" },
            { name: "سيف الدين البقالي", id: "A180061505" },
            { name: "مروان الزموري", id: "A180061506" },
            { name: "ریان أبو حريف", id: "A182054313" },
            { name: "امال حميش", id: "A182075172" },
            { name: "فاطمة الزهرة البقالي", id: "A183062169" },
            { name: "وديع ابراري", id: "A183085038" },
            { name: "ضحی مصبيح", id: "A184016227" },
            { name: "وسيلة امزور", id: "A184055115" },
            { name: "أيمن أقراوش", id: "A185057242" },
            { name: "أسماء تزغرت", id: "A187061548" },
            { name: "إيمان أبو حرايث", id: "A187066708" },
            { name: "سلمی الوزيري", id: "A187077895" },
            { name: "أيمن أشوخي", id: "A189075169" },
            { name: "محمد سعيد امزوز", id: "A212083582" },
            { name: "زهير امزور", id: "P142150669" },
            { name: "محمد الطريح", id: "P150038470" },
            { name: "عادل عزوز", id: "A174071406" }
        ],
        "4": [
            { name: "محمد حميش", id: "A165058266" },
            { name: "ونام أجنان", id: "A167020403" },
            { name: "عبد الله حميش", id: "A169020381" },
            { name: "سلمی أقداح", id: "A170090979" },
            { name: "طارق أبو حرايث", id: "A171070359" },
            { name: "ذكرى مرون", id: "A171071427" },
            { name: "حفصة الطريح", id: "A171071431" },
            { name: "آدم كنبور", id: "A172098993" },
            { name: "سعاد كنبور", id: "A173067111" },
            { name: "أسامة امزور", id: "A173090674" },
            { name: "خولة الهدام", id: "A175067869" },
            { name: "شيماء البقالي", id: "A175076131" },
            { name: "رضی الدقداق", id: "A176073033" },
            { name: "سفیان امزور", id: "A177092916" },
            { name: "منصف حموش", id: "A180061503" },
            { name: "رفيق أولاد قدور", id: "A180080881" },
            { name: "حفصة ابراري", id: "A181016225" },
            { name: "محمد حموش", id: "A181080892" },
            { name: "نوفل عزوز", id: "A182054666" },
            { name: "عبد النزيه أمزور", id: "A183054673" },
            { name: "عبد النعيم بویزم", id: "A185057246" },
            { name: "احمد أولاد قدور", id: "A185080883" },
            { name: "محمد الطريح", id: "A187061490" },
            { name: "مهيدة أشوخي", id: "A187066707" },
            { name: "توفيق قبوع", id: "A187077894" },
            { name: "فردوس حميش", id: "A188055131" },
            { name: "عادل اشراو", id: "A189047160" },
            { name: "لبني حميش", id: "A189055113" },
            { name: "هناء حميش", id: "A189055123" },
            { name: "بوثينة ابراري", id: "A189055125" },
            { name: "محمد حميش", id: "A189055126" },
            { name: "أية حميش", id: "A189055130" },
            { name: "انس ارهون", id: "A189069495" },
            { name: "نسرين اجنان", id: "P141150656" },
            { name: "أنوار محو", id: "P156044519" }
        ],
        "5": [
            { name: "بشری الطريح", id: "A171071423" },
            { name: "محمد رضا التهامي البقالي", id: "A171098983" },
            { name: "خديجة بيحيا", id: "A173071079" },
            { name: "هشام البقالي", id: "A173098979" },
            { name: "جمال الدين الخراز", id: "A173102599" },
            { name: "وداد الدقداق", id: "A173102604" },
            { name: "ندى حميش", id: "A174102606" },
            { name: "محمد بن عبد السلام البقالي", id: "A177042691" },
            { name: "وليد الداق", id: "A178086328" },
            { name: "محمد ابري", id: "A178102594" },
            { name: "سامي أشوخي", id: "A180006279" },
            { name: "مریم البقالي", id: "A180061498" },
            { name: "عبد الله البقالي", id: "A181078784" },
            { name: "دعاء تزغرت", id: "A182007453" },
            { name: "نهيدة امرنيس", id: "A182054664" },
            { name: "عماد الدقداق", id: "A183057546" },
            { name: "محمد علي مشبال", id: "A183080225" },
            { name: "محمد السعيد مشبال", id: "A184047120" },
            { name: "محمد اشرف أقراوش", id: "A185057243" },
            { name: "أنوار حميش", id: "A186055136" },
            { name: "شيماء حميش", id: "A186078766" },
            { name: "أسينة حميش", id: "A186078770" },
            { name: "لیلی البقالي", id: "A187061489" },
            { name: "مریم الهدام", id: "A188057548" },
            { name: "دعاء حميش", id: "A189000197" },
            { name: "نوفل حميش", id: "A189047157" },
            { name: "عبد الجليل حميش", id: "P148149627" },
            { name: "ننيلة امزور", id: "P154046123" },
            { name: "أشرف أحجت", id: "P157059994" },
            { name: "معاد مشبال", id: "A173099948" },
            { name: "محمد جبريل الخراز", id: "A173067836" },
            { name: "صفاء أبو رشاد", id: "A188061395" },
            { name: "سناء الطريح", id: "A184055120" }
        ]
    },
    "9": {
        "1": [
            { name: "نجوی امزور", id: "A160020385" },
            { name: "نجوی اشوخي", id: "A160048340" },
            { name: "انس حميش", id: "A161050259" },
            { name: "سمية الشكوري", id: "A162042387" },
            { name: "كريمة مشبال", id: "A163042801" },
            { name: "سلمی الطريح", id: "A165058256" },
            { name: "كوثر الريفي", id: "A165075066" },
            { name: "آية الشكوري", id: "A169042364" },
            { name: "مراد عدي", id: "A170035511" },
            { name: "خلود الزموري", id: "A170065964" },
            { name: "لمياء الحياني الشكوري", id: "A170068998" },
            { name: "أنس كنبور", id: "A170099015" },
            { name: "ذكرى الشكوري", id: "A171070361" },
            { name: "لمياء بنت عبد الرحمان الشكوري", id: "A171080098" },
            { name: "بلال امرنيس", id: "A173090673" },
            { name: "كريمة أريفي", id: "A173098978" },
            { name: "المفضل صرحان", id: "A174071403" },
            { name: "يوسف أمزور", id: "A174071405" },
            { name: "مروی مشبال", id: "A174071447" },
            { name: "أيمن حميش", id: "A174090343" },
            { name: "نجلاء البقالي", id: "A174098970" },
            { name: "أسامة البقالي", id: "A176042694" },
            { name: "سليمة البقالي", id: "A176042701" },
            { name: "محمد بن نجيم البقالي", id: "A177042693" },
            { name: "مصطفى مرون", id: "A177065944" },
            { name: "انصاف الطريح", id: "A177065954" },
            { name: "سهام الريفي", id: "A177098980" },
            { name: "سعد بعزة", id: "A179069279" },
            { name: "أنوار علي أجنان", id: "A227140282" },
            { name: "ياسين الطريح", id: "A235003896" },
            { name: "امان البقالي", id: "P120053725" },
            { name: "أحمد حميش", id: "P135354731" },
            { name: "عبد العظيم امزور", id: "P141150660" },
            { name: "صفوان أحداش", id: "P144153873" },
            { name: "فيصل الطريح", id: "P150038471" },
            { name: "شيماء البقالي", id: "P152046216" },
            { name: "محمد بيحيا", id: "P158044503" }
        ],
        "2": [
            { name: "يحيى مرون", id: "A160043103" },
            { name: "أحمد أمزور", id: "A163018890" },
            { name: "فاطمة البقالي", id: "A163046766" },
            { name: "محمد أجنان", id: "A166018977" },
            { name: "بلال أحداش", id: "A166018981" },
            { name: "سندوس البقالي", id: "A166050273" },
            { name: "محمد أحداش", id: "A167018975" },
            { name: "فرید أحداش", id: "A167018976" },
            { name: "جهاد اجنان", id: "A167019069" },
            { name: "حسناء محو", id: "A167048366" },
            { name: "ملاك امثيو", id: "A168044339" },
            { name: "ضياء الدين البقالي", id: "A169044327" },
            { name: "سعيد بوعزة", id: "A169072439" },
            { name: "مونية أقداح", id: "A170071462" },
            { name: "عبد المنعم اجنان", id: "A170071467" },
            { name: "هيتم اجنان", id: "A171071413" },
            { name: "إنصاف اجنان", id: "A171071415" },
            { name: "سامية اريفي", id: "A171098982" },
            { name: "ایمان البقالي", id: "A173034024" },
            { name: "هداية المجاوي", id: "A173069240" },
            { name: "رودينة مشبال", id: "A173071083" },
            { name: "عمر الريفي", id: "A173098984" },
            { name: "أسماء الخراز", id: "A173099004" },
            { name: "عصام أشوخي", id: "A174068580" },
            { name: "أشرف أشوخي", id: "A174069009" },
            { name: "إحسان عزوز", id: "A174071396" },
            { name: "سليمان ابو حرايث", id: "A175065959" },
            { name: "خديجة الزكري", id: "A177070956" },
            { name: "ماجدة أشوخي", id: "B177008835" },
            { name: "فطيمة الزهرة البقالي", id: "P134288727" },
            { name: "حاتم أبري", id: "P144150162" },
            { name: "شكيبة عزوز", id: "P151038444" },
            { name: "مصطفى اقداح", id: "P154046121" },
            { name: "فليمة امزور", id: "P154046122" },
            { name: "أيوب عزوز", id: "A166018882" },
            { name: "رجاء عزوز", id: "A170090688" },
            { name: "خولة اور یاغل", id: "P152064692" },
            { name: "معاد الخراز", id: "A178099006" },
            { name: "هشام بوعزة", id: "A173070535" },
            { name: "حليمة اقداح", id: "P120053490" }
        ],
        "3": [
            { name: "شيماء بوعزة", id: "A160042756" },
            { name: "انس مشبال", id: "A161042863" },
            { name: "سهام الشكوري", id: "A161062924" },
            { name: "ميساء البقالي", id: "A161064111" },
            { name: "اية البقالي", id: "A164042361" },
            { name: "فطيمة الوردي", id: "A168042183" },
            { name: "سهام اقداح", id: "A170071475" },
            { name: "نجية أبطوي", id: "A170081011" },
            { name: "مریم احسان", id: "A170089316" },
            { name: "نورة مشعال", id: "A170089512" },
            { name: "خديجة حميش", id: "A171071424" },
            { name: "وداد أجنان", id: "A171071432" },
            { name: "اية مرون", id: "A173069235" },
            { name: "محمد أشراو", id: "A173069241" },
            { name: "عمر البقالي", id: "A173070643" },
            { name: "أكرم ابري", id: "A174068992" },
            { name: "وجدان مشبال", id: "A175068574" },
            { name: "محمد رضا البقالي", id: "A176042699" },
            { name: "انوار محو", id: "A176068212" },
            { name: "دعاء البقالي", id: "A176099008" },
            { name: "البشير محو", id: "A176099009" },
            { name: "محمد بن عبد الباقي البقالي", id: "A177042692" },
            { name: "أيمن أبراري", id: "A177090347" },
            { name: "ادم الشكوري", id: "A178065952" },
            { name: "سهام الداق", id: "A178086326" },
            { name: "دينة أحسان", id: "A178089313" },
            { name: "وسيمة الطريح", id: "A178098986" },
            { name: "كريم أمزور", id: "A186000199" },
            { name: "جعفر حميش", id: "A199110261" },
            { name: "عمر تزغرت", id: "A233003900" },
            { name: "محمد أشراو", id: "P142150160" },
            { name: "ادم بویزم", id: "P151038422" },
            { name: "موسى عزوز", id: "P151038449" },
            { name: "كريمة (محمد) مشبال", id: "P152038478" },
            { name: "خالد مرون", id: "P153044892" },
            { name: "أحلام الدقداق", id: "P155044522" },
            { name: "هناء محو", id: "P156044521" }
        ],
        "4": [
            { name: "وداد ابصال", id: "A160041044" },
            { name: "ياسين عزوز", id: "A161058447" },
            { name: "بلال أقداح", id: "A163018973" },
            { name: "سناء البقالي", id: "A163041054" },
            { name: "فاطمة الزهراء تزغرت", id: "A164048329" },
            { name: "منار البقالي", id: "A165031028" },
            { name: "بلال أمزور", id: "A166018878" },
            { name: "أيمن حموش", id: "A170035514" },
            { name: "عفاف اجنان", id: "A170071469" },
            { name: "منصف أحداش", id: "A170071474" },
            { name: "عز الدين حميش", id: "A170089036" },
            { name: "وداد الطريح", id: "A172065939" },
            { name: "غزلان حميش", id: "A172090341" },
            { name: "بلال البقالي", id: "A172098975" },
            { name: "احمد كنبور", id: "A172098991" },
            { name: "محمد مرون", id: "A173065948" },
            { name: "سارة اباكور", id: "A174069295" },
            { name: "نسرين البقالي", id: "A174070638" },
            { name: "ملاك الدقداق", id: "A174070797" },
            { name: "خالد بيحيا", id: "A175095780" },
            { name: "نعيمة تزغرت", id: "A176070501" },
            { name: "محمد أبو حرايث", id: "A177069014" },
            { name: "تسيم اشوخي", id: "A177069224" },
            { name: "حفصة البقالي", id: "A179065958" },
            { name: "محمد اباكور", id: "A179068042" },
            { name: "محمد نبيل حميش", id: "P130354769" },
            { name: "سوسن عزوز", id: "P138333784" },
            { name: "محمد عبد السلام امزور", id: "P145150677" },
            { name: "دعاء امرئیس", id: "P150044897" },
            { name: "نهاد عزوز", id: "P151038436" },
            { name: "حفصة عزوز", id: "P151038437" },
            { name: "عبد الرحيم عزوز", id: "P151038447" },
            { name: "ايمن مرون", id: "P151050995" },
            { name: "مروان الطريح", id: "P152051717" },
            { name: "هناء مشبال", id: "P151051387" },
            { name: "إحسان الحياني الشكوري", id: "P134288773" },
            { name: "منی العمراني", id: "A176067827" },
            { name: "اسامة حميش", id: "A179065960" }
        ],
        "5": []
    }
};
