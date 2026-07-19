// Title IDs of games confirmed compatible with the Insignia network, scraped from
// https://insignia.live/games (as of 2026-07-19). Insignia's own stats API
// (insigniastats.live) only reports games with current live activity, so this list
// is the only way to tell whether a game supports Insignia at all when nobody
// happens to be online in it right now. Re-scrape the games page to refresh.
export const INSIGNIA_COMPATIBLE_TITLE_IDS: ReadonlySet<string> = new Set([
  "55530036", // 187 Ride or Die
  "45530018", // 25 to Life
  "4D4A0009", // Advent Rising
  "54510101", // AFL Premiership
  "5A440004", // Alien Hominid
  "55530043", // America's Army: Rise of a Soldier
  "4D530041", // Amped 2
  "4D570005", // Area 51
  "54540014", // Army Men - Sarge's War
  "49470079", // Atari Anthology
  "4343000E", // Auto Modellista
  "55530057", // Blazing Angels: Squadrons of WWII
  "5553005A", // Brothers in Arms: Earned in Blood
  "5553003C", // Brothers in Arms: Road to Hill 30
  "41430019", // Burnout 2 - Point of Impact
  "4156003E", // Cabela's Big Game Hunter 2005 Adventures
  "41560019", // Cabela's Dangerous Hunts
  "41560030", // Cabela's Deer Hunt: 2004 Season
  "4156003F", // Cabela's Deer Hunt: 2005 Season
  "41560051", // Call of Duty 2: Big Red One
  "4156005D", // Call of Duty 3
  "4156002A", // Call of Duty: Finest Hour
  "43430010", // Capcom Fighting Evolution
  "43430008", // Capcom vs. SNK 2 EO
  "54540010", // Carve
  "53430100", // Championship Manager 2006
  "4B420005", // Chicago Enforcer
  "44430004", // Cold War
  "434D0010", // Colin McRae Rally 04
  "434D002B", // Colin McRae Rally 2005
  "544D0008", // Conan
  "4D530051", // Conker: Live & Reloaded
  "544D000B", // Corvette
  "48500002", // Counter Terrorist Special Forces - Fire for Effect
  "4D530036", // Counter-Strike
  "4B4E001C", // Crime Life - Gang Wars
  "4D53006F", // Crimson Skies Demo
  "4D530021", // Crimson Skies: High Road to Revenge
  "4B4E0021", // Dance Dance Revolution Ultramix 2
  "4B4E0019", // Dance Dance Revolution: Ultramix
  "4B4E001D", // Dancing Stage Unleashed
  "43430016", // Darkwatch (NTSC)
  "5553005C", // Darkwatch (PAL)
  "54430006", // Dead or Alive Ultimate
  "41560020", // Doom 3
  "4156004E", // DOOM 3: Resurrection of Evil
  "42550004", // Double-S.T.E.A.L - The Second Clash
  "49470038", // DRIV3R
  "434D0028", // England International Football - 2004 Edition
  "53450024", // ESPN College Hoops
  "53450028", // ESPN Major League Baseball
  "53450023", // ESPN NBA Basketball (NTSC)
  "5345002E", // ESPN NBA Basketball (PAL)
  "53450022", // ESPN NFL Football 2004 (NTSC)
  "5345002C", // ESPN NFL Football 2004 (PAL)
  "53450026", // ESPN NHL Hockey (NTSC)
  "5345002D", // ESPN NHL Hockey (PAL)
  "4D53000D", // Fable
  "4D5300D1", // Fable: The Lost Chapters
  "55530008", // Far Cry Instincts
  "55530060", // Far Cry Instincts Evolution
  "454D0007", // Ford Racing 2
  "4D53006E", // Forza Motorsport
  "43560007", // Future Tactics: The Uprising
  "4D570022", // Gauntlet: Seven Sorrows (NTSC)
  "4D570033", // Gauntlet: Seven Sorrows (PAL)
  "49470073", // Godzilla: Save the Earth
  "41560042", // Greg Hastings' Tournament Paintball
  "53410002", // Guilty Gear X2 #Reload
  "53410006", // Guilty Gear X2 #Reload: The Midnight Carnival
  "4156004B", // Gun
  "5443000C", // Gungriffon - Allied Strike (PAL)
  "54430009", // GunGriffon: Allied Strike (USA, Japan)
  "4D530064", // Halo 2
  "534300FA", // Hitman: Blood Money
  "454D001E", // Jacked
  "545100EF", // Juiced
  "4B4E0025", // Karaoke Revolution
  "4B4E002E", // Karaoke Revolution Party
  "534E0006", // King of Fighters 2002
  "544D0007", // Knights of the Temple - Infernal Crusade
  "4D570025", // L.A. Rush
  "47560004", // Land of the Dead: Road to Fiddler's Green
  "4156005C", // Marvel: Ultimate Alliance
  "4D530017", // MechAssault
  "4D53005B", // MechAssault (Xbox Live Demo)
  "56550019", // Men of Valor
  "56550040", // Men of Valor (Germany)
  "534E0002", // Metal Slug 3
  "58580007", // Microsoft Windows Media Center Extender for Xbox
  "54540079", // Midnight Club 3: DUB Edition
  "54540008", // Midnight Club II
  "4D53002A", // Midtown Madness 3
  "4D57001C", // Midway Arcade Treasures
  "4D570020", // Midway Arcade Treasures 2
  "4D57002D", // Midway Arcade Treasures 3
  "4D570034", // Mortal Kombat: Armageddon
  "4D570019", // Mortal Kombat: Deception (NTSC)
  "4D570023", // Mortal Kombat: Deception (PAL)
  "54540015", // Motocross Mania 3
  "54510016", // MotoGP 2
  "54510088", // MotoGP 3
  "54510015", // MotoGP: Online Demo
  "56430001", // Muzzle Flash
  "545100ED", // MX vs. ATV Unleashed
  "4356000E", // MX World Tour featuring Jamie Little
  "5553004A", // Myst IV Revelation
  "4A570002", // Neighbours from Hell
  "54430003", // Ninja Gaiden
  "5443000D", // Ninja Gaiden BLACK
  "55530061", // Open Season
  "434D005A", // Operation Flashpoint: Elite
  "54540017", // Outlaw Golf 2
  "53450036", // OutRun 2
  "53450088", // OutRun 2006: Coast to Coast
  "44430003", // Painkiller: Hell Wars
  "4A570009", // Panzer Elite Action - Fields of Glory
  "4D53004A", // Phantasy Star Online Episode I & II
  "41480002", // Playboy: The Mansion
  "4253000B", // Powerdrome
  "5553001D", // Prince of Persia: Sands of Time
  "5553003B", // Prince of Persia: Warrior Within
  "4B4E0030", // Pro Evolution Soccer 5
  "41540003", // Pro Fishing Challenge
  "4D53004B", // Project Gotham Racing 2
  "53550009", // Psyvariar 2 - Extend Edition
  "41440002", // Pump It Up: Exceed
  "54540011", // Pure Pinball
  "4D530039", // RalliSport Challenge 2
  "4D4A0011", // Raze's Hell
  "584C0001", // Re-Volt
  "5454001A", // Red Dead Revolver
  "41560010", // Return to Castle Wolfenstein: Tides of War
  "53430005", // Richard Burns Rally
  "4A410006", // Room Zoom: Race for Impact
  "53450021", // Sega GT Online
  "5454000D", // Serious Sam II
  "54540083", // Shattered Union
  "5454008F", // Sid Meier's Pirates!
  "4D49000D", // Sniper Elite
  "534E0001", // SNK vs. Capcom: SVC Chaos
  "4156001B", // Soldier of Fortune II: Double Helix
  "53450029", // Spikeout: Battle Street
  "5454007C", // Spy Vs. Spy (NTSC)
  "54540084", // Spy Vs. Spy (PAL)
  "4C410011", // Star Wars: Battlefront
  "4C41001A", // Star Wars: Battlefront II
  "4C41000B", // Star Wars: Jedi Academy
  "4C410013", // Star Wars: Republic Commando
  "4C410004", // Star Wars: The Clone Wars
  "43430009", // Steel Battalion: Line of Contact
  "4D49000B", // Still Life
  "48500001", // Stolen
  "4343000F", // Street Fighter Anniversary Collection
  "43560008", // Strike Force Bowling
  "56560025", // SWAT - Global Strike Team
  "4343000D", // Tekki Taisen - Steel Battalion - Line of Contact
  "41560026", // Tenchu: Return From Darkness (NTSC)
  "5451001C", // Tetris Worlds Online
  "56550026", // The Chronicles of Riddick: Escape from Butcher Bay
  "54510018", // The Punisher
  "4D57002C", // The Suffering - Ties That Bind
  "46530003", // Thousand Land
  "434D000E", // TOCA Race Driver
  "434D0011", // TOCA Race Driver 2
  "55530006", // Tom Clancy's Ghost Recon
  "55530007", // Tom Clancy's Ghost Recon: Island Thunder
  "55530013", // Tom Clancy's Rainbow Six 3
  "5553005E", // Tom Clancy's Splinter Cell Double Agent
  "55530019", // Tom Clancy's Splinter Cell Pandora Tomorrow
  "55530038", // Tom Clancy's Splinter Cell: Chaos Theory
  "55530041", // Tom Clancy's Splinter Cell: Chaos Theory (Versus Mode)
  "41560049", // Tony Hawk’s American Wasteland
  "43560009", // Trigger Man
  "4947003D", // Trivial Pursuit: Unhinged
  "42560001", // Tron 2.0: Killer App
  "4D4A000C", // Ultra Bust-A-Move
  "49470024", // Unreal Championship
  "4D570021", // Unreal Championship 2 - The Liandri Conflict
  "4947003C", // Unreal II: The Awakening
  "534300F7", // Urban Chaos: Riot Response
  "56550029", // Van Helsing
  "5454000A", // Vietcong: Purple Haze
  "54540016", // Virtual Pool - Tournament Edition
  "4D530027", // Whacked!
  "4D530040", // Whacked! Trial Version
  "434D002A", // World Championship Snooker 2004
  "41560054", // World Series of Poker
  "4D4A0017", // Worms 4: Mayhem (NTSC)
  "434D0052", // Worms 4: Mayhem (PAL)
  "54510024", // WWE WrestleMania 21 (NTSC)
  "545100F9", // WWE WrestleMania 21 (PAL)
  "41560047", // X-Men Legends II: Rise of Apocalypse
  "4D5300C8", // Xbox Live Arcade
  "584C000B", // Xbox Live Starter Kit Disc / Zunou Taisen Live
  "4D53005A", // Xbox Music Mixer
  "4D53007C", // Xbox Video Chat
  "55530009", // XIII
  "50430001", // Xyanide
]);

export function isInsigniaCompatible(titleId: string): boolean {
  return INSIGNIA_COMPATIBLE_TITLE_IDS.has(titleId.toUpperCase());
}
