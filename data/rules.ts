export type InferenceRule = { id: string; inputs: string[]; output: string; explanation: string }

export const inferenceRules: InferenceRule[] = [
 {id:'R1',inputs:['Precise location','Timestamps'],output:'Home address and street',explanation:'Precise location (clause 4.2) + timestamps (clause 4.3) could reveal where you sleep.'},
 {id:'R2',inputs:['Precise location','Timestamps'],output:'Workplace or office',explanation:'Repeated daytime location and timestamps could suggest a workplace.'},
 {id:'R3',inputs:['Precise location','Email ending in .edu'],output:'School',explanation:'Precise location and an .edu email could point to a school or campus.'},
 {id:'R4',inputs:['Precise location','Usage activity'],output:'Daily schedule',explanation:'Location patterns paired with usage activity could reveal a routine.'},
 {id:'R5',inputs:['Contacts or messaging metadata'],output:'Social circle',explanation:'Contacts or interaction metadata could reveal who you know.'},
 {id:'R6',inputs:['Usage or purchase data','Ad-partner sharing'],output:'Interests and purchases',explanation:'Usage or purchase data shared with ad partners could suggest your interests.'},
 {id:'R7',inputs:['IP address'],output:'City only',explanation:'An IP address could suggest an approximate city, not a precise address.'},
 {id:'R8',inputs:['Wi-Fi or Bluetooth scanning'],output:'Neighborhood',explanation:'Nearby Wi-Fi or Bluetooth signals could narrow location to a neighborhood.'},
 {id:'R9',inputs:['Photos','Location metadata'],output:'Places visited, tied to face',explanation:'Photos with location metadata could connect a face to places visited.'},
 {id:'R10',inputs:['Device ID','Third-party sharing'],output:'Profile merged across apps',explanation:'A shared device ID could allow a profile to be matched across apps.'}
]
