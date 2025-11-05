export function normalizeStudentId(value) {
    if (typeof value === "undefined" || value === null) return "";
    return String(value).trim().replace(/\s+/g, "").toUpperCase();
}

export function buildStudentDocId(grade, group, studentId) {
    const normalizedId = normalizeStudentId(studentId);
    if (!normalizedId || !grade || !group) return "";
    const safeId = normalizedId.replace(/[^A-Z0-9_-]/g, "-");
    return `${grade}-${group}-${safeId}`;
}

export function parseStudentsFromText(text) {
    if (!text) return [];

    const lines = text
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    const results = [];
    const studentRegex = /(.*?)([APB]\d{6,})/u;

    lines.forEach(line => {
        const cleanLine = line.replace(/\s+/g, " ").trim();
        const match = cleanLine.match(studentRegex);
        if (match) {
            const name = match[1].trim();
            const studentId = normalizeStudentId(match[2]);
            if (name && studentId) {
                results.push({ name, studentId });
            }
        }
    });

    const unique = new Map();
    results.forEach(student => {
        if (!unique.has(student.studentId)) {
            unique.set(student.studentId, student);
        }
    });

    return Array.from(unique.values());
}

export function arrayBufferToBase64(buffer) {
    if (!buffer) return "";

    if (typeof Buffer !== "undefined") {
        return Buffer.from(buffer).toString("base64");
    }

    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    if (typeof btoa === "function") {
        return btoa(binary);
    }

    throw new Error("No base64 encoder available in this environment");
}
