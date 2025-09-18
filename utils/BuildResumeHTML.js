
// utils/BuildResumeHTML.js
function buildResumeHTML(data) {
  const {
    applicantName,
    firstName,
    middleName,
    lastName,
    emailAddress,
    phoneNumber,
    dateOfBirth,
    maritalStatus,
    languages,
    presentAddress,
    preferredJob,
    experience,
    profileSummary,
    primarySkills,
    skills,
    educations,
    experiences,
    projects,
    certifications,
    socialProfiles
  } = data;

  const fullName = [firstName, middleName, lastName]
    .filter(Boolean)
    .join(" ");

  // render a list section only if items exist
  const renderList = (title, items, renderItem) => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return `
      <section class="">
        <h2 class="text-xl font-semibold  text-[#8C18C3] pb-1 ">${title}</h2>
        ${items.map(renderItem).join("")}
      </section>
    `;
  };

  const renderSkills = () => {
    let tempSkills = []
    if (primarySkills?.length > 0 && Array.isArray(primarySkills)) {
      const tempPrimarySkills = primarySkills.map(skill => ({
        skill: skill.primarySkill,
        experience: skill.experience,
        lastUsed: skill.lastUsed,
        version: skill.version,
        isPrimary: true
      }))
      tempSkills.push(...tempPrimarySkills)
    }

    if (skills?.length > 0 && Array.isArray(skills)) {
      const tempSkill = skills.map(skill => ({
        skill: skill.skill,
        experience: skill.experience,
        lastUsed: skill.lastUsed,
        version: skill.version,
        isPrimary: false
      }))
      tempSkills.push(...tempSkill)
    }


    return tempSkills.map(skill => (`<span class="p-1 rounded-md border bg-[#8C18C3] text-white text-sm ">${skill.skill}</span>`)).join("")
  }
// ${skill.isPrimary?'bg-blue-100 text-blue-800 ':'bg-slate-100 text-slate-900 border w-max'}

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Resume — ${applicantName || fullName || "Candidate"}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="text-gray-800 font-sans px-5">
  <!-- Header -->
  <header class=" mb-4">
    <h1 class="text-2xl font-semibold text-[#8C18C3] mb-2">
      ${fullName || "MERN Stack Developer"}
    </h1>
      <!-- Summary -->
    ${preferredJob?.length > 0 ? `<h2 class="font-medium mb-2 text-black">${Array.isArray(preferredJob) ? (preferredJob[0].toUpperCase()) : ""} </h2>`: ""}
        ${profileSummary
    ? `
    <p class="text-lg mb-3 text-gray-500">
     ${profileSummary} 
    </p>` : ""
    }
   <div class='flex flex-row flex-wrap items-center gap-2 text-gray-600 bg-gray-200'>
    ${emailAddress ? `<p class="m-2"><i class="bi bi-envelope-fill text-[#8C18C3]"></i> ${emailAddress}</p>` : ""}
    ${phoneNumber?.number
      ? `<p class="mt-1"> <i class="bi bi-telephone-fill text-[#8C18C3]"></i> ${phoneNumber?.countryCode ? '+'+phoneNumber?.countryCode : ""} ${phoneNumber.number}</p>`
      : ""}
    ${(presentAddress?.addressLine1 || presentAddress?.addressLine2 || presentAddress?.city || presentAddress?.state || presentAddress?.country) ?
    `<p>
       <i class="bi bi-geo-fill  text-[#8C18C3]"></i>
        ${[presentAddress.addressLine1, presentAddress.addressLine2, presentAddress.city, presentAddress.state, presentAddress.country]
      .filter(Boolean)
      .join(", ")}
        ${(presentAddress?.zipCode) ? `<p>${' - ' + presentAddress.zipCode}</p>`: ""}
    </p>`: ""}
    </div>
  </header>

  <main class="">
  
   
<div class="mb-4">
      <h2 class="text-xl font-semibold  text-[#8C18C3] pb-1 ">Skills</h2>
      <div class="flex flex-wrap items-top gap-2 ">
        ${renderSkills()}
     </div>
</div>
    ${renderList(
      "Work Experience",
      experiences,
      (ex) => `
      <div class="mb-4 ">
        <p class="font-semibold text-lg text-black">
          ${ex.jobTitle ?? ""}
        </p>
         <p class="font-medium text-sm text-black">
           ${ex.employer ? ` ${ex.employer}` : ""}
        </p>
        <p class="text-xs text-gray-600">
          ${ex.periodFrom ? new Date(ex.periodFrom).toLocaleDateString() : ""} 
          – ${ex.isOngoing ? "Present" : ex.periodTo ? new Date(ex.periodTo).toLocaleDateString() : ""}
        </p>
        ${ex.description ? `<p class="mt-2"><i class="bi bi-dot text-black"></i>${ex.description}</p>` : ""}
      </div>
    `
    )}

    ${renderList(
      "Education",
      educations,
      (ed) => `
      <div class="mb-4">
        <p class="font-semibold text-lg text-black">${ed.courseName ?? ed.courseType ?? ""}</p>
        <p class="font-semibold text-sm text-black">${ed.institutionName ?? ""}</p>
        <p  class="text-xs text-gray-600"> ${ed.courseCompletion?.year
          ? ` ${ed.courseCompletion.year}`
          : ""
        }</p>
      </div>
    `
    )}


    

    </div>




    ${renderList(
      "Projects",
      projects,
      (pr) => `
      <div class="mb-4">
        <p class="font-semibold text-lg text-black">${pr.projectName ?? ""}</p>
        ${pr.description ? `<p class="mt-1">${pr.description}</p>` : ""}
      </div>
    `
    )}

    ${renderList(
      "Certifications",
      certifications,
      (c) => `
      <div class="mb-4">
        <p class="font-semibold text-lg text-black">${c.certificationName ?? ""}</p>
        <p>${c.organization ?? ""}${c.periodFrom ? ` • ${new Date(c.periodFrom).getFullYear()}` : ""
        }</p>
      </div>
    `
    )}
  </main>
  <p class=" fixed bottom-0 right-0  text-xs">Powered by <b class="text-blue-800"> Career Connect AI</b></p>
</body>
</html>
  `;
}

module.exports = buildResumeHTML;
