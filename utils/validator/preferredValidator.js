// ✅ Preferred Job Info validation
const validatePreferredJobForm = (values) => {
    const errors = {};

    // 1. Array fields - at least 1 value select panna vendum
    if (!Array.isArray(values.preferredJobRole) || values.preferredJobRole.length === 0) {
       return errors.preferredJobRole = "Select at least one job role.";
    }

    if (!Array.isArray(values.preferredJobLocations) || values.preferredJobLocations.length === 0) {
        return errors.preferredJobLocations = "Select at least one job location.";
    }

    if (!Array.isArray(values.employmentType) || values.employmentType.length === 0) {
        return errors.employmentType = "Select at least one employment type.";
    }

    if (!Array.isArray(values.preferredWorkMode) || values.preferredWorkMode.length === 0) {
        return errors.preferredWorkMode = "Select at least one work mode.";
    }

    // 2. CTC Validation (current & expected → only numbers allowed, optional LPA)
    const ctcRegex = /^[0-9]+(\.[0-9]{1,2})?$/; // 10 or 10.5 etc.
    if (!values.currentCTC || !ctcRegex.test(values.currentCTC)) {
        return errors.currentCTC = "Enter a valid Current CTC (numbers only, e.g., 5 or 5.5).";
    }

    if (!values.expectedCTC || !ctcRegex.test(values.expectedCTC)) {
        return errors.expectedCTC = "Enter a valid Expected CTC (numbers only, e.g., 10 or 10.5).";
    }

    // 3. Notice period (accepts only numbers in days or months)

    if (!values.noticePeriod) {
        errors.noticePeriod = "Enter a valid Notice Period (e.g., 30d or 2m).";
    }

    return errors;
}

module.exports = validatePreferredJobForm 