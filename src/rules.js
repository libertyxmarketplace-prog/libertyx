/**
 * Alabama State Roleplay — Game Rules.
 * Every rule is written for Alabama State Roleplay and numbered R-1 upwards.
 * Grouped into pages so the panel stays readable.
 */
export const RULES_PAGES = [
  {
    title: 'Core Roleplay',
    blurb: 'The baseline every member is expected to follow in every scene.',
    rules: [
      { t: 'Immersion & Realism', d: 'Portray a believable person with realistic reactions. Behaviour that could never happen in real life, breaks immersion, or ignores the world around you may be actioned.' },
      { t: 'Unprovoked Attacks', d: 'Harming another character without a believable in-character reason is not permitted.' },
      { t: 'Vehicle Attacks', d: 'Using a vehicle as a weapon without a believable in-character reason is not permitted.' },
      { t: 'Character Knowledge', d: 'Only act on information your character could genuinely know. Anything from Discord, streams, alternate accounts or private messages must never influence your roleplay.' },
      { t: 'Self Preservation', d: "Value your character's life. Comply when clearly outmatched, avoid unnecessary heroics, and never seek out danger for no reason." },
      { t: 'Afterlife Rule', d: 'After dying and respawning, your character remembers nothing. No returning to the scene, seeking revenge, or rejoining the situation.' },
      { t: 'Disconnecting to Escape', d: 'Leaving, switching teams, or logging off to avoid arrest, injury, or consequences is not permitted.' },
      { t: 'Joining Unfinished Scenes', d: 'Do not insert yourself into traffic stops, pursuits, medical calls, fires, or investigations unless you have a believable reason to be there. Bystanders keep their distance and follow instructions from emergency services.' }
    ]
  },
{
    title: 'Tuscaloosa Departments',
    blurb: "Standards for the Department of Tuscaloosa Police, the Tuscaloosa Sheriff's Office, Tuscaloosa Highway Patrol, the Tuscaloosa Fire Department and Northstar Medics.",
    rules: [
      { t: 'Unauthorised Markings', d: 'Liveries, callsigns, vehicles, equipment, or titles reserved for Command, Division, Supervisor, or specialist teams may only be used by authorised ranked members of that department.' },
      { t: 'Equipment Purpose', d: 'Department equipment must be used realistically and only for its intended job. Using it to troll, block roleplay, or create lag is not permitted. Spike strips must never be placed directly in front of a moving vehicle without fair warning, and may not be used to trap stationary vehicles.' },
      { t: 'Personnel Impersonation', d: 'Impersonating supervisors, command, specialist units, or any ranked member is prohibited - including restricted vehicles, ranked name tags, and ranked callsigns. LED light bars are limited to authorised Tuscaloosa Highway Patrol Crown Vics, and unapproved agencies (FBI, NSA, CIA, Border Patrol, etc.) may not be roleplayed.' },
      { t: 'Callsigns', d: "Ranked personnel follow their department's callsign policy. Unranked members may only use numerical callsigns - letters are reserved for ranked positions." },
      { t: 'Uniform Standards', d: 'Wear the uniform of the department you are on: Tuscaloosa Police uniforms for police, Tuscaloosa Fire Department uniforms for Fire/Rescue, and ALDOT uniforms while operating as the Alabama Department of Transportation. Mixing departments is not permitted.' },
      { t: 'Private Security Scope', d: 'Security personnel are not law enforcement. No traffic stops, arrests, pursuits, or emergency equipment to bypass traffic law.' },
      { t: 'Fire & EMS Deployment', d: 'Fire and EMS apparatus are for emergency response, station duties, training, public events, approved standbys, department business, and reasonable breaks - never general patrol. Only apparatus capable of off-road access may work rural Alabama terrain.' },
      { t: 'ALDOT Exclusivity', d: 'Only official Tuscaloosa businesses may run non-ALDOT roleplay on the ALDOT team, and it must relate to that business.' },
      { t: 'Undercover Work', d: 'Undercover vehicles are for authorised ranked personnel within department guidelines. Private vehicles may not be used as undercover vehicles without department approval. Unmarked plates, plain clothes, and detective uniforms are restricted to approved operations.' },
      { t: 'On-Duty Conduct', d: 'While on a department team you may not commit crimes, act unrealistically, or act against your duties. Vehicle misuse, ignoring procedure, and abusing access, equipment, or privileges is prohibited.' },
      { t: 'Scene Authority', d: 'Law enforcement commands law enforcement scenes, Fire & EMS commands fire and medical scenes, and ALDOT commands approved roadway work zones. Reasonable compliance with safety instructions is required.' },
      { t: 'Unranked Units', d: 'Unranked units are exempt from some department regulations, but on an active scene they follow the primary officer and any supervisor. An unranked primary officer holds command until relieved.' }
    ]
  },
{
    title: 'Criminal Activity',
    blurb: 'What is expected of criminal-roleplay characters in Tuscaloosa County.',
    rules: [
      { t: 'Safe Zones', d: 'No criminal activity in safe zones: Fire/Rescue stations, law enforcement facilities including the prison, the DMV, ALDOT facilities, and civilian spawn locations.' },
      { t: 'Provoking Enforcement', d: 'Do not deliberately bait officers into stops or pursuits without a believable purpose - no reckless driving for attention, circling police scenes, or disrupting operations.' },
      { t: 'Fleeing a Traffic Stop', d: 'Fleeing a lawful stop needs a believable reason: active warrants, contraband, ongoing criminal activity, or fear of arrest for another crime. Wanting a pursuit or not wanting a ticket is not a valid reason.' },
      { t: 'Abduction Roleplay', d: 'Kidnappings need a believable purpose and may not be random. You may opt out before the scenario begins - once it starts and you have committed, you may not drop out simply because you changed your mind.' },
      { t: 'Hostage Roleplay', d: 'Hostage scenarios need proper development and at least two criminals. No random executions - escalate believably and offer negotiation chances where reasonable. Opting out follows the same rule as abductions.' },
      { t: 'Interfering with Services', d: 'Do not block apparatus bays or responding vehicles, jump on emergency vehicles, enter scenes without authorisation, prevent EMS treatment, or disrupt suppression and rescue operations.' },
      { t: 'Group Limits', d: 'Criminal roleplay is limited to groups of four (4) or fewer. Five (5) or more participants in criminal activity is not permitted.' },
      { t: 'Terrain Evasion', d: 'The mountains, the river, and rural state parks may not be used solely to escape law enforcement.' }
    ]
  },
{
    title: 'Vehicles',
    blurb: 'Driving standards for every road in Tuscaloosa County.',
    rules: [
      { t: 'Realistic Operation', d: 'Operate every vehicle as a real person would, considering its size, weight, speed, terrain, weather, and road conditions. Stunts without roleplay reason, or ignoring real limitations, are prohibited. Only SUVs and pickups (excluding FWCC vehicles) may reach the mountain.' },
      { t: 'Pursuit Standards', d: 'Pursuits must prioritise realism, public safety, and fair roleplay. Tactics that create unnecessary danger, endanger civilians, or force an outcome are prohibited, as are unrealistic tactics that would not happen in the real world.' },
      { t: 'Off-Roading', d: 'Vehicles may only go where they could realistically function. Sports cars stay off-road, passenger cars do not climb mountains, and high-speed off-roading is prohibited.' },
      { t: 'Warning Devices', d: 'Horn, ELS siren, and airhorn spam - or use without a believable reason for more than 5-10 seconds - is prohibited.' },
      { t: 'Specialised Equipment', d: 'Lawnmowers operate on grass and sidewalks only, cross at pedestrian crossings, and never take part in pursuits. ATVs and UTVs are limited to rural Alabama, the farms, and the mountain trails, must be trailered between authorised areas, may only run on closed roads during approved events, and any pursuit involving them stays inside Tuscaloosa County.' },
      { t: 'Restricted Vehicles', d: 'Banned and restricted vehicles are listed in the vehicle information channel. Restricted vehicles may not be used.' }
    ]
  },
{
    title: 'Combat & Weapons',
    blurb: 'When force is allowed, and what may never be used.',
    rules: [
      { t: 'Escalation', d: 'Violence should be proportional. Always try talking, warning, or demanding first - force is a last resort.' },
      { t: 'Staff Are Not Targets', d: 'Combat, hostile action, or violent roleplay against staff performing official duties, in uniform, or in a marked staff vehicle is prohibited - including attacks, attempted kills, hostage situations, or interfering with staff actions.' },
      { t: 'Weapon Restrictions', d: 'Civilians may not use the Sniper, Remington 870, Remington 700, PPSH-41, M249, TEC-9, or Skorpion. LEO may not use the Type 89, MP5, or Benelli M4. SWAT Sniper and G36C are restricted to authorised tactical teams or specialist groups.' }
    ]
  },
{
    title: 'Conduct & Community',
    blurb: 'How every member is expected to behave inside and out of the server.',
    rules: [
      { t: 'Staff Authority', d: 'Staff interpret and enforce these rules case by case - no written rule can cover every situation.' },
      { t: 'Staff Decisions Final', d: 'Moderation decisions are final. Take disagreements through the proper appeal or complaint process.' },
      { t: 'Interfering with Staff', d: 'Interfering with staff duties, moderation actions, or any staff scene is prohibited.' },
      { t: 'Loopholes', d: 'Exploiting technicalities, unclear wording, or omissions to gain an advantage or dodge punishment is prohibited.' },
      { t: 'Alternate Accounts', d: 'Alts may not be used to evade punishment, bypass restrictions, gain advantages, or steer roleplay.' },
      { t: 'Impersonating Staff', d: 'Impersonating Alabama State Roleplay staff, Management, or Leadership with the intent to deceive is prohibited.' },
      { t: 'Misuse of !mod', d: 'False reports, fabricated evidence, or misleading staff during investigations is prohibited. Use !mod for real issues - not for refreshes, loads, or teleports.' },
      { t: 'Common Sense', d: 'Use common sense. Clearly disruptive, abusive, unrealistic, or harmful behaviour may be actioned even if it is not written here.' },
      { t: 'Adults Only', d: 'Any roleplay depicting a child or anyone under 18 is not allowed.' },
      { t: 'Avatar Standards', d: 'Use a realistic avatar that represents a human. Inappropriate, invisible, troll-like, or misleading avatars are not allowed - no floating accessories, effects, or oversized items. Staff may require a change.' },
      { t: 'Roblox Terms of Service', d: "All in-game behaviour must follow Roblox's Terms of Service and Community Standards. This includes no racism or discriminatory roleplay, bomb or terrorism roleplay, suicide or self-harm roleplay, and drug manufacture, distribution, or use." },
      { t: 'AFK Policy', d: 'AFKing for more than 5 minutes may result in a kick. First offence: you may rejoin immediately. Second offence: wait 1 hour.' },
      { t: 'Roleplay Contribution', d: 'Everyone in-game, except active staff, should be contributing. Sitting around without engaging in roleplay is not tolerated.' },
      { t: 'Exploits & Glitches', d: 'Intentionally using bugs, glitches, physics errors, or unintended mechanics to gain an advantage, avoid roleplay, escape consequences, or reach restricted areas is prohibited.' },
      { t: 'Evading Identified Staff', d: 'Running, resetting, rejoining, leaving, or changing teams to escape anyone clearly marked or reasonably identified as staff is not permitted.' }
    ]
  },
{
    title: 'Enforcement',
    blurb: 'How rule breaks are handled.',
    rules: [
      { t: 'Moderator Discretion', d: "All rule breaks are handled at the moderator's discretion." },
      { t: 'Punishments Vary', d: "Punishments can and will vary depending on the severity of the situation, how it is handled, and a member's prior record." },
      { t: 'Appeals', d: 'If you believe a decision was wrong, use the official appeal or complaint process instead of arguing publicly.' }
    ]
  }
];
