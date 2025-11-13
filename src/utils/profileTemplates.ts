/**
 * Pre-built profile templates with common form fields
 */

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  fields: { key: string; label: string; type: string; placeholder: string }[];
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: 'personal_complete',
    name: 'Complete Personal Profile',
    description: 'All personal information fields for government forms, applications, etc.',
    icon: '👤',
    fields: [
      // Name fields
      { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John' },
      { key: 'middleName', label: 'Middle Name', type: 'text', placeholder: 'Robert' },
      { key: 'lastName', label: 'Last Name / Surname', type: 'text', placeholder: 'Doe' },
      { key: 'fullName', label: 'Full Legal Name', type: 'text', placeholder: 'John Robert Doe' },
      { key: 'maidenName', label: 'Maiden Name (if applicable)', type: 'text', placeholder: 'Smith' },
      { key: 'preferredName', label: 'Preferred Name / Nickname', type: 'text', placeholder: 'Johnny' },
      
      // Birth information
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', placeholder: 'MM/DD/YYYY or YYYY-MM-DD' },
      { key: 'placeOfBirth', label: 'Place of Birth', type: 'text', placeholder: 'City, State/Country' },
      { key: 'age', label: 'Age', type: 'number', placeholder: '30' },
      
      // Gender and demographics
      { key: 'gender', label: 'Gender', type: 'text', placeholder: 'Male/Female/Other' },
      { key: 'maritalStatus', label: 'Marital Status', type: 'text', placeholder: 'Single/Married/Divorced/Widowed' },
      { key: 'dateOfMarriage', label: 'Date of Marriage', type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'nationality', label: 'Nationality / Citizenship', type: 'text', placeholder: 'American' },
      { key: 'race', label: 'Race / Ethnicity', type: 'text', placeholder: '' },
      
      // Contact information
      { key: 'email', label: 'Email Address', type: 'email', placeholder: 'john@example.com' },
      { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '(555) 123-4567' },
      { key: 'mobilePhone', label: 'Mobile Phone', type: 'tel', placeholder: '(555) 987-6543' },
      { key: 'homePhone', label: 'Home Phone', type: 'tel', placeholder: '(555) 111-2222' },
      { key: 'workPhone', label: 'Work Phone', type: 'tel', placeholder: '(555) 333-4444' },
      
      // Current address
      { key: 'address', label: 'Street Address / Address Line 1', type: 'text', placeholder: '123 Main St' },
      { key: 'address2', label: 'Address Line 2 (Apt/Suite)', type: 'text', placeholder: 'Apt 4B' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'New York' },
      { key: 'state', label: 'State / Province', type: 'text', placeholder: 'NY' },
      { key: 'zipCode', label: 'Zip / Postal Code', type: 'text', placeholder: '10001' },
      { key: 'country', label: 'Country', type: 'text', placeholder: 'United States' },
      
      // Previous/Mailing address
      { key: 'mailingAddress', label: 'Mailing Address (if different)', type: 'text', placeholder: '456 Oak Ave' },
      { key: 'previousAddress', label: 'Previous Address', type: 'text', placeholder: '789 Pine Rd' },
      
      // Government IDs
      { key: 'ssn', label: 'Social Security Number (SSN)', type: 'text', placeholder: '123-45-6789' },
      { key: 'passportNumber', label: 'Passport Number', type: 'text', placeholder: 'AB1234567' },
      { key: 'passportExpiry', label: 'Passport Expiration Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'driversLicense', label: "Driver's License Number", type: 'text', placeholder: 'D1234567' },
      { key: 'licenseExpiry', label: 'License Expiration Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      
      // Physical description
      { key: 'height', label: 'Height', type: 'text', placeholder: '5\'10" or 178cm' },
      { key: 'weight', label: 'Weight', type: 'text', placeholder: '150 lbs or 68 kg' },
      { key: 'eyeColor', label: 'Eye Color', type: 'text', placeholder: 'Brown' },
      { key: 'hairColor', label: 'Hair Color', type: 'text', placeholder: 'Black' },
      
      // Emergency contact
      { key: 'emergencyContactName', label: 'Emergency Contact Name', type: 'text', placeholder: 'Jane Doe' },
      { key: 'emergencyContactPhone', label: 'Emergency Contact Phone', type: 'tel', placeholder: '(555) 999-8888' },
      { key: 'emergencyContactRelation', label: 'Relationship to Emergency Contact', type: 'text', placeholder: 'Spouse/Parent/Friend' },
    ],
  },
  {
    id: 'work_professional',
    name: 'Work & Professional',
    description: 'Employment, company, and professional information',
    icon: '💼',
    fields: [
      // Current employment
      { key: 'company', label: 'Company / Employer Name', type: 'text', placeholder: 'Tech Corp Inc.' },
      { key: 'jobTitle', label: 'Job Title / Position', type: 'text', placeholder: 'Software Engineer' },
      { key: 'department', label: 'Department', type: 'text', placeholder: 'Engineering' },
      { key: 'employeeId', label: 'Employee ID', type: 'text', placeholder: 'EMP-12345' },
      { key: 'startDate', label: 'Employment Start Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'yearsOfExperience', label: 'Years of Experience', type: 'number', placeholder: '5' },
      
      // Company contact
      { key: 'workEmail', label: 'Work Email', type: 'email', placeholder: 'john@company.com' },
      { key: 'workPhone', label: 'Work Phone', type: 'tel', placeholder: '(555) 123-4567' },
      { key: 'workExtension', label: 'Extension', type: 'text', placeholder: 'x1234' },
      
      // Company address
      { key: 'companyAddress', label: 'Company Address', type: 'text', placeholder: '100 Business Blvd' },
      { key: 'companyCity', label: 'Company City', type: 'text', placeholder: 'San Francisco' },
      { key: 'companyState', label: 'Company State', type: 'text', placeholder: 'CA' },
      { key: 'companyZip', label: 'Company Zip', type: 'text', placeholder: '94105' },
      
      // Manager/Supervisor
      { key: 'managerName', label: "Manager's Name", type: 'text', placeholder: 'Jane Smith' },
      { key: 'managerEmail', label: "Manager's Email", type: 'email', placeholder: 'jane@company.com' },
      { key: 'managerPhone', label: "Manager's Phone", type: 'tel', placeholder: '(555) 111-2222' },
      
      // Previous employment
      { key: 'previousEmployer', label: 'Previous Employer', type: 'text', placeholder: 'Previous Corp' },
      { key: 'previousJobTitle', label: 'Previous Job Title', type: 'text', placeholder: 'Junior Developer' },
      
      // Professional info
      { key: 'linkedIn', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/johndoe' },
      { key: 'professionalWebsite', label: 'Professional Website', type: 'url', placeholder: 'https://johndoe.com' },
      { key: 'github', label: 'GitHub Profile', type: 'url', placeholder: 'https://github.com/johndoe' },
    ],
  },
  {
    id: 'education',
    name: 'Education & Qualifications',
    description: 'Academic history, degrees, certifications',
    icon: '🎓',
    fields: [
      // Current/Highest education
      { key: 'highestDegree', label: 'Highest Degree', type: 'text', placeholder: 'Bachelor of Science' },
      { key: 'fieldOfStudy', label: 'Field of Study / Major', type: 'text', placeholder: 'Computer Science' },
      { key: 'university', label: 'University / College', type: 'text', placeholder: 'Stanford University' },
      { key: 'graduationYear', label: 'Graduation Year', type: 'number', placeholder: '2019' },
      { key: 'gpa', label: 'GPA', type: 'text', placeholder: '3.8/4.0' },
      
      // High school
      { key: 'highSchool', label: 'High School', type: 'text', placeholder: 'Lincoln High School' },
      { key: 'highSchoolGradYear', label: 'High School Graduation Year', type: 'number', placeholder: '2015' },
      
      // Certifications
      { key: 'certifications', label: 'Certifications', type: 'textarea', placeholder: 'AWS Solutions Architect, PMP, etc.' },
      { key: 'licenses', label: 'Professional Licenses', type: 'textarea', placeholder: 'CPA License #12345' },
      
      // Student info (if applicable)
      { key: 'studentId', label: 'Student ID Number', type: 'text', placeholder: 'STU-123456' },
      { key: 'expectedGraduation', label: 'Expected Graduation', type: 'date', placeholder: 'MM/YYYY' },
    ],
  },
  {
    id: 'financial',
    name: 'Financial & Banking',
    description: 'Bank accounts, payment methods, financial information',
    icon: '💳',
    fields: [
      // Banking
      { key: 'bankName', label: 'Bank Name', type: 'text', placeholder: 'Chase Bank' },
      { key: 'accountNumber', label: 'Account Number', type: 'text', placeholder: '1234567890' },
      { key: 'routingNumber', label: 'Routing Number', type: 'text', placeholder: '021000021' },
      { key: 'accountType', label: 'Account Type', type: 'text', placeholder: 'Checking/Savings' },
      
      // Income
      { key: 'annualIncome', label: 'Annual Income', type: 'text', placeholder: '$75,000' },
      { key: 'employmentStatus', label: 'Employment Status', type: 'text', placeholder: 'Full-time/Part-time/Self-employed' },
      
      // Tax information
      { key: 'taxId', label: 'Tax ID / EIN', type: 'text', placeholder: '12-3456789' },
    ],
  },
  {
    id: 'medical',
    name: 'Medical & Health',
    description: 'Health insurance, medical information, emergency',
    icon: '🏥',
    fields: [
      // Insurance
      { key: 'insuranceProvider', label: 'Insurance Provider', type: 'text', placeholder: 'Blue Cross' },
      { key: 'policyNumber', label: 'Policy Number', type: 'text', placeholder: 'POL-123456' },
      { key: 'groupNumber', label: 'Group Number', type: 'text', placeholder: 'GRP-7890' },
      { key: 'memberId', label: 'Member ID', type: 'text', placeholder: 'MEM-ABC123' },
      
      // Medical info
      { key: 'bloodType', label: 'Blood Type', type: 'text', placeholder: 'A+' },
      { key: 'allergies', label: 'Allergies', type: 'textarea', placeholder: 'Penicillin, Peanuts' },
      { key: 'medications', label: 'Current Medications', type: 'textarea', placeholder: 'List medications' },
      { key: 'medicalConditions', label: 'Medical Conditions', type: 'textarea', placeholder: 'Diabetes, Asthma, etc.' },
      
      // Emergency
      { key: 'physicianName', label: "Primary Physician's Name", type: 'text', placeholder: 'Dr. Jane Smith' },
      { key: 'physicianPhone', label: "Physician's Phone", type: 'tel', placeholder: '(555) 111-2222' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Immigration',
    description: 'Passport, visa, travel history, immigration forms',
    icon: '✈️',
    fields: [
      // Passport
      { key: 'passportNumber', label: 'Passport Number', type: 'text', placeholder: 'AB1234567' },
      { key: 'passportIssueDate', label: 'Passport Issue Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'passportExpiryDate', label: 'Passport Expiry Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'passportIssueCountry', label: 'Passport Issuing Country', type: 'text', placeholder: 'United States' },
      { key: 'passportIssuePlace', label: 'Place of Issue', type: 'text', placeholder: 'New York' },
      
      // Visa information
      { key: 'visaNumber', label: 'Visa Number', type: 'text', placeholder: 'VISA-123456' },
      { key: 'visaType', label: 'Visa Type', type: 'text', placeholder: 'Tourist/Work/Student' },
      { key: 'visaExpiry', label: 'Visa Expiry Date', type: 'date', placeholder: 'MM/DD/YYYY' },
      
      // Travel
      { key: 'frequentFlyerNumber', label: 'Frequent Flyer Number', type: 'text', placeholder: 'FF123456789' },
      { key: 'travelDocumentNumber', label: 'Travel Document Number', type: 'text', placeholder: 'TD-12345' },
      { key: 'previousCountriesVisited', label: 'Countries Previously Visited', type: 'textarea', placeholder: 'Canada, Mexico, UK, France...' },
    ],
  },
  {
    id: 'family',
    name: 'Family Information',
    description: 'Spouse, children, parents, family members',
    icon: '👨‍👩‍👧‍👦',
    fields: [
      // Spouse
      { key: 'spouseName', label: "Spouse's Full Name", type: 'text', placeholder: 'Jane Doe' },
      { key: 'spouseDateOfBirth', label: "Spouse's Date of Birth", type: 'date', placeholder: 'MM/DD/YYYY' },
      { key: 'spouseNationality', label: "Spouse's Nationality", type: 'text', placeholder: 'American' },
      { key: 'spouseOccupation', label: "Spouse's Occupation", type: 'text', placeholder: 'Teacher' },
      
      // Children
      { key: 'numberOfChildren', label: 'Number of Children', type: 'number', placeholder: '2' },
      { key: 'childrenNames', label: "Children's Names", type: 'textarea', placeholder: 'Emma Doe, Liam Doe' },
      
      // Parents
      { key: 'motherName', label: "Mother's Full Name", type: 'text', placeholder: 'Mary Smith' },
      { key: 'fatherName', label: "Father's Full Name", type: 'text', placeholder: 'Robert Doe' },
      { key: 'motherMaidenName', label: "Mother's Maiden Name", type: 'text', placeholder: 'Johnson' },
      
      // Family contact
      { key: 'nextOfKinName', label: 'Next of Kin Name', type: 'text', placeholder: 'Jane Doe' },
      { key: 'nextOfKinRelation', label: 'Relationship', type: 'text', placeholder: 'Spouse/Parent/Sibling' },
      { key: 'nextOfKinPhone', label: 'Next of Kin Phone', type: 'tel', placeholder: '(555) 123-4567' },
    ],
  },
  {
    id: 'custom_minimal',
    name: 'Quick Start (Basic Fields)',
    description: 'Just the essentials - name, email, phone, address',
    icon: '⚡',
    fields: [
      { key: 'fullName', label: 'Full Name', type: 'text', placeholder: 'John Doe' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567' },
      { key: 'address', label: 'Address', type: 'text', placeholder: '123 Main St' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'New York' },
      { key: 'state', label: 'State', type: 'text', placeholder: 'NY' },
      { key: 'zipCode', label: 'Zip Code', type: 'text', placeholder: '10001' },
    ],
  },
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ProfileTemplate | null {
  return PROFILE_TEMPLATES.find(t => t.id === id) || null;
}

/**
 * Create profile data from template
 */
export function createProfileFromTemplate(template: ProfileTemplate): { [key: string]: string } {
  const data: { [key: string]: string } = {};
  
  template.fields.forEach(field => {
    data[field.key] = ''; // Empty strings - user will fill in
  });
  
  return data;
}

