export interface StateCode {
  state: string;
  code: string;
}

export const STATE_CODE: StateCode[] = [
  { state: 'Jammu and Kashmir', code: '01' },
  { state: 'Himachal Pradesh', code: '02' },
  { state: 'Punjab', code: '03' },
  { state: 'Chandigarh', code: '04' },
  { state: 'Uttarakhand', code: '05' },
  { state: 'Haryana', code: '06' },
  { state: 'Delhi', code: '07' },
  { state: 'Rajasthan', code: '08' },
  { state: 'Uttar Pradesh', code: '09' },
  { state: 'Bihar', code: '10' },
  { state: 'Sikkim', code: '11' },
  { state: 'Arunachal Pradesh', code: '12' },
  { state: 'Nagaland', code: '13' },
  { state: 'Manipur', code: '14' },
  { state: 'Mizoram', code: '15' },
  { state: 'Tripura', code: '16' },
  { state: 'Meghalaya', code: '17' },
  { state: 'Assam', code: '18' },
  { state: 'West Bengal', code: '19' },
  { state: 'Jharkhand', code: '20' },
  { state: 'Odisha', code: '21' },
  { state: 'Chhattisgarh', code: '22' },
  { state: 'Madhya Pradesh', code: '23' },
  { state: 'Gujarat', code: '24' },
  { state: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' }, // Merged UT code
  { state: 'Maharashtra', code: '27' },
  { state: 'Karnataka', code: '29' }, // Fixed mapping
  { state: 'Goa', code: '30' },
  { state: 'Lakshadweep', code: '31' },
  { state: 'Kerala', code: '32' },
  { state: 'Tamil Nadu', code: '33' },
  { state: 'Puducherry', code: '34' },
  { state: 'Andaman and Nicobar Islands', code: '35' },
  { state: 'Telangana', code: '36' },
  { state: 'Andhra Pradesh', code: '37' }, // Standard post-division code
  { state: 'Ladakh', code: '38' }, // Newest territory code
  { state: 'Other Territory', code: '97' },
  { state: 'Centre Jurisdiction', code: '99' }, // Used for specific administrative reporting
];
export const getStateByCode = (code: string) => {
  return STATE_CODE.find((item) => item.code === code);
};

export const getCodeByState = (state: string) => {
  return STATE_CODE.find(
    (item) => item.state.toLowerCase() === state.toLowerCase(),
  );
};
