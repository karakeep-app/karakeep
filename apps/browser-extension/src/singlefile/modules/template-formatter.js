/*
 * Copyright 2010-2022 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 *
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or
 *   modify it under the terms of the GNU Affero General Public License
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 *
 *   The code in this file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

/* global btoa, atob */

import { parse } from "./template-parser.js";
import { getContentSize, digest, getValidFilename } from "./../core/helper.js";

const Blob = globalThis.Blob;
const FileReader = globalThis.FileReader;
const URL = globalThis.URL;
const Intl = globalThis.Intl;
const URLSearchParams = globalThis.URLSearchParams;
const navigator = globalThis.navigator;

const REGEXP_ESCAPE = /([{}()^$&.*?/+|[\\\\]|\]|-)/g;

const EMOJI_NAMES = {
	"😀": "grinning-face",
	"😃": "grinning-face-with-big-eyes",
	"😄": "grinning-face-with-smiling-eyes",
	"😁": "beaming-face-with-smiling-eyes",
	"😆": "grinning-squinting-face",
	"😅": "grinning-face-with-sweat",
	"🤣": "rolling-on-the-floor-laughing",
	"😂": "face-with-tears-of-joy",
	"🙂": "slightly-smiling-face",
	"🙃": "upside-down-face",
	"🫠": "melting-face",
	"😉": "winking-face",
	"😊": "smiling-face-with-smiling-eyes",
	"😇": "smiling-face-with-halo",
	"🥰": "smiling-face-with-hearts",
	"😍": "smiling-face-with-heart-eyes",
	"🤩": "star-struck",
	"😘": "face-blowing-a-kiss",
	"😗": "kissing-face",
	"☺": "smiling-face",
	"😚": "kissing-face-with-closed-eyes",
	"😙": "kissing-face-with-smiling-eyes",
	"🥲": "smiling-face-with-tear",
	"😋": "face-savoring-food",
	"😛": "face-with-tongue",
	"😜": "winking-face-with-tongue",
	"🤪": "zany-face",
	"😝": "squinting-face-with-tongue",
	"🤑": "money-mouth-face",
	"🤗": "smiling-face-with-open-hands",
	"🤭": "face-with-hand-over-mouth",
	"🫢": "face-with-open-eyes-and-hand-over-mouth",
	"🫣": "face-with-peeking-eye",
	"🤫": "shushing-face",
	"🤔": "thinking-face",
	"🫡": "saluting-face",
	"🤐": "zipper-mouth-face",
	"🤨": "face-with-raised-eyebrow",
	"😐": "neutral-face",
	"😑": "expressionless-face",
	"😶": "face-without-mouth",
	"🫥": "dotted-line-face",
	"😶‍🌫️": "face-in-clouds",
	"😏": "smirking-face",
	"😒": "unamused-face",
	"🙄": "face-with-rolling-eyes",
	"😬": "grimacing-face",
	"😮‍💨": "face-exhaling",
	"🤥": "lying-face",
	"🫨": "⊛-shaking-face",
	"😌": "relieved-face",
	"😔": "pensive-face",
	"😪": "sleepy-face",
	"🤤": "drooling-face",
	"😴": "sleeping-face",
	"😷": "face-with-medical-mask",
	"🤒": "face-with-thermometer",
	"🤕": "face-with-head-bandage",
	"🤢": "nauseated-face",
	"🤮": "face-vomiting",
	"🤧": "sneezing-face",
	"🥵": "hot-face",
	"🥶": "cold-face",
	"🥴": "woozy-face",
	"😵": "face-with-crossed-out-eyes",
	"😵‍💫": "face-with-spiral-eyes",
	"🤯": "exploding-head",
	"🤠": "cowboy-hat-face",
	"🥳": "partying-face",
	"🥸": "disguised-face",
	"😎": "smiling-face-with-sunglasses",
	"🤓": "nerd-face",
	"🧐": "face-with-monocle",
	"😕": "confused-face",
	"🫤": "face-with-diagonal-mouth",
	"😟": "worried-face",
	"🙁": "slightly-frowning-face",
	"☹": "frowning-face",
	"😮": "face-with-open-mouth",
	"😯": "hushed-face",
	"😲": "astonished-face",
	"😳": "flushed-face",
	"🥺": "pleading-face",
	"🥹": "face-holding-back-tears",
	"😦": "frowning-face-with-open-mouth",
	"😧": "anguished-face",
	"😨": "fearful-face",
	"😰": "anxious-face-with-sweat",
	"😥": "sad-but-relieved-face",
	"😢": "crying-face",
	"😭": "loudly-crying-face",
	"😱": "face-screaming-in-fear",
	"😖": "confounded-face",
	"😣": "persevering-face",
	"😞": "disappointed-face",
	"😓": "downcast-face-with-sweat",
	"😩": "weary-face",
	"😫": "tired-face",
	"🥱": "yawning-face",
	"😤": "face-with-steam-from-nose",
	"😡": "enraged-face",
	"😠": "angry-face",
	"🤬": "face-with-symbols-on-mouth",
	"😈": "smiling-face-with-horns",
	"👿": "angry-face-with-horns",
	"💀": "skull",
	"☠": "skull-and-crossbones",
	"💩": "pile-of-poo",
	"🤡": "clown-face",
	"👹": "ogre",
	"👺": "goblin",
	"👻": "ghost",
	"👽": "alien",
	"👾": "alien-monster",
	"🤖": "robot",
	"😺": "grinning-cat",
	"😸": "grinning-cat-with-smiling-eyes",
	"😹": "cat-with-tears-of-joy",
	"😻": "smiling-cat-with-heart-eyes",
	"😼": "cat-with-wry-smile",
	"😽": "kissing-cat",
	"🙀": "weary-cat",
	"😿": "crying-cat",
	"😾": "pouting-cat",
	"🙈": "see-no-evil-monkey",
	"🙉": "hear-no-evil-monkey",
	"🙊": "speak-no-evil-monkey",
	"💌": "love-letter",
	"💘": "heart-with-arrow",
	"💝": "heart-with-ribbon",
	"💖": "sparkling-heart",
	"💗": "growing-heart",
	"💓": "beating-heart",
	"💞": "revolving-hearts",
	"💕": "two-hearts",
	"💟": "heart-decoration",
	"❣": "heart-exclamation",
	"💔": "broken-heart",
	"❤️‍🔥": "heart-on-fire",
	"❤️‍🩹": "mending-heart",
	"❤": "red-heart",
	"🩷": "⊛-pink-heart",
	"🧡": "orange-heart",
	"💛": "yellow-heart",
	"💚": "green-heart",
	"💙": "blue-heart",
	"🩵": "⊛-light-blue-heart",
	"💜": "purple-heart",
	"🤎": "brown-heart",
	"🖤": "black-heart",
	"🩶": "⊛-grey-heart",
	"🤍": "white-heart",
	"💋": "kiss-mark",
	"💯": "hundred-points",
	"💢": "anger-symbol",
	"💥": "collision",
	"💫": "dizzy",
	"💦": "sweat-droplets",
	"💨": "dashing-away",
	"🕳": "hole",
	"💬": "speech-balloon",
	"👁️‍🗨️": "eye-in-speech-bubble",
	"🗨": "left-speech-bubble",
	"🗯": "right-anger-bubble",
	"💭": "thought-balloon",
	"💤": "zzz",
	"👋": "waving-hand",
	"🤚": "raised-back-of-hand",
	"🖐": "hand-with-fingers-splayed",
	"✋": "raised-hand",
	"🖖": "vulcan-salute",
	"🫱": "rightwards-hand",
	"🫲": "leftwards-hand",
	"🫳": "palm-down-hand",
	"🫴": "palm-up-hand",
	"🫷": "⊛-leftwards-pushing-hand",
	"🫸": "⊛-rightwards-pushing-hand",
	"👌": "ok-hand",
	"🤌": "pinched-fingers",
	"🤏": "pinching-hand",
	"✌": "victory-hand",
	"🤞": "crossed-fingers",
	"🫰": "hand-with-index-finger-and-thumb-crossed",
	"🤟": "love-you-gesture",
	"🤘": "sign-of-the-horns",
	"🤙": "call-me-hand",
	"👈": "backhand-index-pointing-left",
	"👉": "backhand-index-pointing-right",
	"👆": "backhand-index-pointing-up",
	"🖕": "middle-finger",
	"👇": "backhand-index-pointing-down",
	"☝": "index-pointing-up",
	"🫵": "index-pointing-at-the-viewer",
	"👍": "thumbs-up",
	"👎": "thumbs-down",
	"✊": "raised-fist",
	"👊": "oncoming-fist",
	"🤛": "left-facing-fist",
	"🤜": "right-facing-fist",
	"👏": "clapping-hands",
	"🙌": "raising-hands",
	"🫶": "heart-hands",
	"👐": "open-hands",
	"🤲": "palms-up-together",
	"🤝": "handshake",
	"🙏": "folded-hands",
	"✍": "writing-hand",
	"💅": "nail-polish",
	"🤳": "selfie",
	"💪": "flexed-biceps",
	"🦾": "mechanical-arm",
	"🦿": "mechanical-leg",
	"🦵": "leg",
	"🦶": "foot",
	"👂": "ear",
	"🦻": "ear-with-hearing-aid",
	"👃": "nose",
	"🧠": "brain",
	"🫀": "anatomical-heart",
	"🫁": "lungs",
	"🦷": "tooth",
	"🦴": "bone",
	"👀": "eyes",
	"👁": "eye",
	"👅": "tongue",
	"👄": "mouth",
	"🫦": "biting-lip",
	"👶": "baby",
	"🧒": "child",
	"👦": "boy",
	"👧": "girl",
	"🧑": "person",
	"👱": "person-blond-hair",
	"👨": "man",
	"🧔": "person-beard",
	"🧔‍♂️": "man-beard",
	"🧔‍♀️": "woman-beard",
	"👨‍🦰": "man-red-hair",
	"👨‍🦱": "man-curly-hair",
	"👨‍🦳": "man-white-hair",
	"👨‍🦲": "man-bald",
	"👩": "woman",
	"👩‍🦰": "woman-red-hair",
	"🧑‍🦰": "person-red-hair",
	"👩‍🦱": "woman-curly-hair",
	"🧑‍🦱": "person-curly-hair",
	"👩‍🦳": "woman-white-hair",
	"🧑‍🦳": "person-white-hair",
	"👩‍🦲": "woman-bald",
	"🧑‍🦲": "person-bald",
	"👱‍♀️": "woman-blond-hair",
	"👱‍♂️": "man-blond-hair",
	"🧓": "older-person",
	"👴": "old-man",
	"👵": "old-woman",
	"🙍": "person-frowning",
	"🙍‍♂️": "man-frowning",
	"🙍‍♀️": "woman-frowning",
	"🙎": "person-pouting",
	"🙎‍♂️": "man-pouting",
	"🙎‍♀️": "woman-pouting",
	"🙅": "person-gesturing-no",
	"🙅‍♂️": "man-gesturing-no",
	"🙅‍♀️": "woman-gesturing-no",
	"🙆": "person-gesturing-ok",
	"🙆‍♂️": "man-gesturing-ok",
	"🙆‍♀️": "woman-gesturing-ok",
	"💁": "person-tipping-hand",
	"💁‍♂️": "man-tipping-hand",
	"💁‍♀️": "woman-tipping-hand",
	"🙋": "person-raising-hand",
	"🙋‍♂️": "man-raising-hand",
	"🙋‍♀️": "woman-raising-hand",
	"🧏": "deaf-person",
	"🧏‍♂️": "deaf-man",
	"🧏‍♀️": "deaf-woman",
	"🙇": "person-bowing",
	"🙇‍♂️": "man-bowing",
	"🙇‍♀️": "woman-bowing",
	"🤦": "person-facepalming",
	"🤦‍♂️": "man-facepalming",
	"🤦‍♀️": "woman-facepalming",
	"🤷": "person-shrugging",
	"🤷‍♂️": "man-shrugging",
	"🤷‍♀️": "woman-shrugging",
	"🧑‍⚕️": "health-worker",
	"👨‍⚕️": "man-health-worker",
	"👩‍⚕️": "woman-health-worker",
	"🧑‍🎓": "student",
	"👨‍🎓": "man-student",
	"👩‍🎓": "woman-student",
	"🧑‍🏫": "teacher",
	"👨‍🏫": "man-teacher",
	"👩‍🏫": "woman-teacher",
	"🧑‍⚖️": "judge",
	"👨‍⚖️": "man-judge",
	"👩‍⚖️": "woman-judge",
	"🧑‍🌾": "farmer",
	"👨‍🌾": "man-farmer",
	"👩‍🌾": "woman-farmer",
	"🧑‍🍳": "cook",
	"👨‍🍳": "man-cook",
	"👩‍🍳": "woman-cook",
	"🧑‍🔧": "mechanic",
	"👨‍🔧": "man-mechanic",
	"👩‍🔧": "woman-mechanic",
	"🧑‍🏭": "factory-worker",
	"👨‍🏭": "man-factory-worker",
	"👩‍🏭": "woman-factory-worker",
	"🧑‍💼": "office-worker",
	"👨‍💼": "man-office-worker",
	"👩‍💼": "woman-office-worker",
	"🧑‍🔬": "scientist",
	"👨‍🔬": "man-scientist",
	"👩‍🔬": "woman-scientist",
	"🧑‍💻": "technologist",
	"👨‍💻": "man-technologist",
	"👩‍💻": "woman-technologist",
	"🧑‍🎤": "singer",
	"👨‍🎤": "man-singer",
	"👩‍🎤": "woman-singer",
	"🧑‍🎨": "artist",
	"👨‍🎨": "man-artist",
	"👩‍🎨": "woman-artist",
	"🧑‍✈️": "pilot",
	"👨‍✈️": "man-pilot",
	"👩‍✈️": "woman-pilot",
	"🧑‍🚀": "astronaut",
	"👨‍🚀": "man-astronaut",
	"👩‍🚀": "woman-astronaut",
	"🧑‍🚒": "firefighter",
	"👨‍🚒": "man-firefighter",
	"👩‍🚒": "woman-firefighter",
	"👮": "police-officer",
	"👮‍♂️": "man-police-officer",
	"👮‍♀️": "woman-police-officer",
	"🕵": "detective",
	"🕵️‍♂️": "man-detective",
	"🕵️‍♀️": "woman-detective",
	"💂": "guard",
	"💂‍♂️": "man-guard",
	"💂‍♀️": "woman-guard",
	"🥷": "ninja",
	"👷": "construction-worker",
	"👷‍♂️": "man-construction-worker",
	"👷‍♀️": "woman-construction-worker",
	"🫅": "person-with-crown",
	"🤴": "prince",
	"👸": "princess",
	"👳": "person-wearing-turban",
	"👳‍♂️": "man-wearing-turban",
	"👳‍♀️": "woman-wearing-turban",
	"👲": "person-with-skullcap",
	"🧕": "woman-with-headscarf",
	"🤵": "person-in-tuxedo",
	"🤵‍♂️": "man-in-tuxedo",
	"🤵‍♀️": "woman-in-tuxedo",
	"👰": "person-with-veil",
	"👰‍♂️": "man-with-veil",
	"👰‍♀️": "woman-with-veil",
	"🤰": "pregnant-woman",
	"🫃": "pregnant-man",
	"🫄": "pregnant-person",
	"🤱": "breast-feeding",
	"👩‍🍼": "woman-feeding-baby",
	"👨‍🍼": "man-feeding-baby",
	"🧑‍🍼": "person-feeding-baby",
	"👼": "baby-angel",
	"🎅": "santa-claus",
	"🤶": "mrs-claus",
	"🧑‍🎄": "mx-claus",
	"🦸": "superhero",
	"🦸‍♂️": "man-superhero",
	"🦸‍♀️": "woman-superhero",
	"🦹": "supervillain",
	"🦹‍♂️": "man-supervillain",
	"🦹‍♀️": "woman-supervillain",
	"🧙": "mage",
	"🧙‍♂️": "man-mage",
	"🧙‍♀️": "woman-mage",
	"🧚": "fairy",
	"🧚‍♂️": "man-fairy",
	"🧚‍♀️": "woman-fairy",
	"🧛": "vampire",
	"🧛‍♂️": "man-vampire",
	"🧛‍♀️": "woman-vampire",
	"🧜": "merperson",
	"🧜‍♂️": "merman",
	"🧜‍♀️": "mermaid",
	"🧝": "elf",
	"🧝‍♂️": "man-elf",
	"🧝‍♀️": "woman-elf",
	"🧞": "genie",
	"🧞‍♂️": "man-genie",
	"🧞‍♀️": "woman-genie",
	"🧟": "zombie",
	"🧟‍♂️": "man-zombie",
	"🧟‍♀️": "woman-zombie",
	"🧌": "troll",
	"💆": "person-getting-massage",
	"💆‍♂️": "man-getting-massage",
	"💆‍♀️": "woman-getting-massage",
	"💇": "person-getting-haircut",
	"💇‍♂️": "man-getting-haircut",
	"💇‍♀️": "woman-getting-haircut",
	"🚶": "person-walking",
	"🚶‍♂️": "man-walking",
	"🚶‍♀️": "woman-walking",
	"🧍": "person-standing",
	"🧍‍♂️": "man-standing",
	"🧍‍♀️": "woman-standing",
	"🧎": "person-kneeling",
	"🧎‍♂️": "man-kneeling",
	"🧎‍♀️": "woman-kneeling",
	"🧑‍🦯": "person-with-white-cane",
	"👨‍🦯": "man-with-white-cane",
	"👩‍🦯": "woman-with-white-cane",
	"🧑‍🦼": "person-in-motorized-wheelchair",
	"👨‍🦼": "man-in-motorized-wheelchair",
	"👩‍🦼": "woman-in-motorized-wheelchair",
	"🧑‍🦽": "person-in-manual-wheelchair",
	"👨‍🦽": "man-in-manual-wheelchair",
	"👩‍🦽": "woman-in-manual-wheelchair",
	"🏃": "person-running",
	"🏃‍♂️": "man-running",
	"🏃‍♀️": "woman-running",
	"💃": "woman-dancing",
	"🕺": "man-dancing",
	"🕴": "person-in-suit-levitating",
	"👯": "people-with-bunny-ears",
	"👯‍♂️": "men-with-bunny-ears",
	"👯‍♀️": "women-with-bunny-ears",
	"🧖": "person-in-steamy-room",
	"🧖‍♂️": "man-in-steamy-room",
	"🧖‍♀️": "woman-in-steamy-room",
	"🧗": "person-climbing",
	"🧗‍♂️": "man-climbing",
	"🧗‍♀️": "woman-climbing",
	"🤺": "person-fencing",
	"🏇": "horse-racing",
	"⛷": "skier",
	"🏂": "snowboarder",
	"🏌": "person-golfing",
	"🏌️‍♂️": "man-golfing",
	"🏌️‍♀️": "woman-golfing",
	"🏄": "person-surfing",
	"🏄‍♂️": "man-surfing",
	"🏄‍♀️": "woman-surfing",
	"🚣": "person-rowing-boat",
	"🚣‍♂️": "man-rowing-boat",
	"🚣‍♀️": "woman-rowing-boat",
	"🏊": "person-swimming",
	"🏊‍♂️": "man-swimming",
	"🏊‍♀️": "woman-swimming",
	"⛹": "person-bouncing-ball",
	"⛹️‍♂️": "man-bouncing-ball",
	"⛹️‍♀️": "woman-bouncing-ball",
	"🏋": "person-lifting-weights",
	"🏋️‍♂️": "man-lifting-weights",
	"🏋️‍♀️": "woman-lifting-weights",
	"🚴": "person-biking",
	"🚴‍♂️": "man-biking",
	"🚴‍♀️": "woman-biking",
	"🚵": "person-mountain-biking",
	"🚵‍♂️": "man-mountain-biking",
	"🚵‍♀️": "woman-mountain-biking",
	"🤸": "person-cartwheeling",
	"🤸‍♂️": "man-cartwheeling",
	"🤸‍♀️": "woman-cartwheeling",
	"🤼": "people-wrestling",
	"🤼‍♂️": "men-wrestling",
	"🤼‍♀️": "women-wrestling",
	"🤽": "person-playing-water-polo",
	"🤽‍♂️": "man-playing-water-polo",
	"🤽‍♀️": "woman-playing-water-polo",
	"🤾": "person-playing-handball",
	"🤾‍♂️": "man-playing-handball",
	"🤾‍♀️": "woman-playing-handball",
	"🤹": "person-juggling",
	"🤹‍♂️": "man-juggling",
	"🤹‍♀️": "woman-juggling",
	"🧘": "person-in-lotus-position",
	"🧘‍♂️": "man-in-lotus-position",
	"🧘‍♀️": "woman-in-lotus-position",
	"🛀": "person-taking-bath",
	"🛌": "person-in-bed",
	"🧑‍🤝‍🧑": "people-holding-hands",
	"👭": "women-holding-hands",
	"👫": "woman-and-man-holding-hands",
	"👬": "men-holding-hands",
	"💏": "kiss",
	"👩‍❤️‍💋‍👨": "kiss-woman,-man",
	"👨‍❤️‍💋‍👨": "kiss-man,-man",
	"👩‍❤️‍💋‍👩": "kiss-woman,-woman",
	"💑": "couple-with-heart",
	"👩‍❤️‍👨": "couple-with-heart-woman,-man",
	"👨‍❤️‍👨": "couple-with-heart-man,-man",
	"👩‍❤️‍👩": "couple-with-heart-woman,-woman",
	"👪": "family",
	"👨‍👩‍👦": "family-man,-woman,-boy",
	"👨‍👩‍👧": "family-man,-woman,-girl",
	"👨‍👩‍👧‍👦": "family-man,-woman,-girl,-boy",
	"👨‍👩‍👦‍👦": "family-man,-woman,-boy,-boy",
	"👨‍👩‍👧‍👧": "family-man,-woman,-girl,-girl",
	"👨‍👨‍👦": "family-man,-man,-boy",
	"👨‍👨‍👧": "family-man,-man,-girl",
	"👨‍👨‍👧‍👦": "family-man,-man,-girl,-boy",
	"👨‍👨‍👦‍👦": "family-man,-man,-boy,-boy",
	"👨‍👨‍👧‍👧": "family-man,-man,-girl,-girl",
	"👩‍👩‍👦": "family-woman,-woman,-boy",
	"👩‍👩‍👧": "family-woman,-woman,-girl",
	"👩‍👩‍👧‍👦": "family-woman,-woman,-girl,-boy",
	"👩‍👩‍👦‍👦": "family-woman,-woman,-boy,-boy",
	"👩‍👩‍👧‍👧": "family-woman,-woman,-girl,-girl",
	"👨‍👦": "family-man,-boy",
	"👨‍👦‍👦": "family-man,-boy,-boy",
	"👨‍👧": "family-man,-girl",
	"👨‍👧‍👦": "family-man,-girl,-boy",
	"👨‍👧‍👧": "family-man,-girl,-girl",
	"👩‍👦": "family-woman,-boy",
	"👩‍👦‍👦": "family-woman,-boy,-boy",
	"👩‍👧": "family-woman,-girl",
	"👩‍👧‍👦": "family-woman,-girl,-boy",
	"👩‍👧‍👧": "family-woman,-girl,-girl",
	"🗣": "speaking-head",
	"👤": "bust-in-silhouette",
	"👥": "busts-in-silhouette",
	"🫂": "people-hugging",
	"👣": "footprints",
	"🦰": "red-hair",
	"🦱": "curly-hair",
	"🦳": "white-hair",
	"🦲": "bald",
	"🐵": "monkey-face",
	"🐒": "monkey",
	"🦍": "gorilla",
	"🦧": "orangutan",
	"🐶": "dog-face",
	"🐕": "dog",
	"🦮": "guide-dog",
	"🐕‍🦺": "service-dog",
	"🐩": "poodle",
	"🐺": "wolf",
	"🦊": "fox",
	"🦝": "raccoon",
	"🐱": "cat-face",
	"🐈": "cat",
	"🐈‍⬛": "black-cat",
	"🦁": "lion",
	"🐯": "tiger-face",
	"🐅": "tiger",
	"🐆": "leopard",
	"🐴": "horse-face",
	"🫎": "⊛-moose",
	"🫏": "⊛-donkey",
	"🐎": "horse",
	"🦄": "unicorn",
	"🦓": "zebra",
	"🦌": "deer",
	"🦬": "bison",
	"🐮": "cow-face",
	"🐂": "ox",
	"🐃": "water-buffalo",
	"🐄": "cow",
	"🐷": "pig-face",
	"🐖": "pig",
	"🐗": "boar",
	"🐽": "pig-nose",
	"🐏": "ram",
	"🐑": "ewe",
	"🐐": "goat",
	"🐪": "camel",
	"🐫": "two-hump-camel",
	"🦙": "llama",
	"🦒": "giraffe",
	"🐘": "elephant",
	"🦣": "mammoth",
	"🦏": "rhinoceros",
	"🦛": "hippopotamus",
	"🐭": "mouse-face",
	"🐁": "mouse",
	"🐀": "rat",
	"🐹": "hamster",
	"🐰": "rabbit-face",
	"🐇": "rabbit",
	"🐿": "chipmunk",
	"🦫": "beaver",
	"🦔": "hedgehog",
	"🦇": "bat",
	"🐻": "bear",
	"🐻‍❄️": "polar-bear",
	"🐨": "koala",
	"🐼": "panda",
	"🦥": "sloth",
	"🦦": "otter",
	"🦨": "skunk",
	"🦘": "kangaroo",
	"🦡": "badger",
	"🐾": "paw-prints",
	"🦃": "turkey",
	"🐔": "chicken",
	"🐓": "rooster",
	"🐣": "hatching-chick",
	"🐤": "baby-chick",
	"🐥": "front-facing-baby-chick",
	"🐦": "bird",
	"🐧": "penguin",
	"🕊": "dove",
	"🦅": "eagle",
	"🦆": "duck",
	"🦢": "swan",
	"🦉": "owl",
	"🦤": "dodo",
	"🪶": "feather",
	"🦩": "flamingo",
	"🦚": "peacock",
	"🦜": "parrot",
	"🪽": "⊛-wing",
	"🐦‍⬛": "⊛-black-bird",
	"🪿": "⊛-goose",
	"🐸": "frog",
	"🐊": "crocodile",
	"🐢": "turtle",
	"🦎": "lizard",
	"🐍": "snake",
	"🐲": "dragon-face",
	"🐉": "dragon",
	"🦕": "sauropod",
	"🦖": "t-rex",
	"🐳": "spouting-whale",
	"🐋": "whale",
	"🐬": "dolphin",
	"🦭": "seal",
	"🐟": "fish",
	"🐠": "tropical-fish",
	"🐡": "blowfish",
	"🦈": "shark",
	"🐙": "octopus",
	"🐚": "spiral-shell",
	"🪸": "coral",
	"🪼": "⊛-jellyfish",
	"🐌": "snail",
	"🦋": "butterfly",
	"🐛": "bug",
	"🐜": "ant",
	"🐝": "honeybee",
	"🪲": "beetle",
	"🐞": "lady-beetle",
	"🦗": "cricket",
	"🪳": "cockroach",
	"🕷": "spider",
	"🕸": "spider-web",
	"🦂": "scorpion",
	"🦟": "mosquito",
	"🪰": "fly",
	"🪱": "worm",
	"🦠": "microbe",
	"💐": "bouquet",
	"🌸": "cherry-blossom",
	"💮": "white-flower",
	"🪷": "lotus",
	"🏵": "rosette",
	"🌹": "rose",
	"🥀": "wilted-flower",
	"🌺": "hibiscus",
	"🌻": "sunflower",
	"🌼": "blossom",
	"🌷": "tulip",
	"🪻": "⊛-hyacinth",
	"🌱": "seedling",
	"🪴": "potted-plant",
	"🌲": "evergreen-tree",
	"🌳": "deciduous-tree",
	"🌴": "palm-tree",
	"🌵": "cactus",
	"🌾": "sheaf-of-rice",
	"🌿": "herb",
	"☘": "shamrock",
	"🍀": "four-leaf-clover",
	"🍁": "maple-leaf",
	"🍂": "fallen-leaf",
	"🍃": "leaf-fluttering-in-wind",
	"🪹": "empty-nest",
	"🪺": "nest-with-eggs",
	"🍄": "mushroom",
	"🍇": "grapes",
	"🍈": "melon",
	"🍉": "watermelon",
	"🍊": "tangerine",
	"🍋": "lemon",
	"🍌": "banana",
	"🍍": "pineapple",
	"🥭": "mango",
	"🍎": "red-apple",
	"🍏": "green-apple",
	"🍐": "pear",
	"🍑": "peach",
	"🍒": "cherries",
	"🍓": "strawberry",
	"🫐": "blueberries",
	"🥝": "kiwi-fruit",
	"🍅": "tomato",
	"🫒": "olive",
	"🥥": "coconut",
	"🥑": "avocado",
	"🍆": "eggplant",
	"🥔": "potato",
	"🥕": "carrot",
	"🌽": "ear-of-corn",
	"🌶": "hot-pepper",
	"🫑": "bell-pepper",
	"🥒": "cucumber",
	"🥬": "leafy-green",
	"🥦": "broccoli",
	"🧄": "garlic",
	"🧅": "onion",
	"🥜": "peanuts",
	"🫘": "beans",
	"🌰": "chestnut",
	"🫚": "⊛-ginger-root",
	"🫛": "⊛-pea-pod",
	"🍞": "bread",
	"🥐": "croissant",
	"🥖": "baguette-bread",
	"🫓": "flatbread",
	"🥨": "pretzel",
	"🥯": "bagel",
	"🥞": "pancakes",
	"🧇": "waffle",
	"🧀": "cheese-wedge",
	"🍖": "meat-on-bone",
	"🍗": "poultry-leg",
	"🥩": "cut-of-meat",
	"🥓": "bacon",
	"🍔": "hamburger",
	"🍟": "french-fries",
	"🍕": "pizza",
	"🌭": "hot-dog",
	"🥪": "sandwich",
	"🌮": "taco",
	"🌯": "burrito",
	"🫔": "tamale",
	"🥙": "stuffed-flatbread",
	"🧆": "falafel",
	"🥚": "egg",
	"🍳": "cooking",
	"🥘": "shallow-pan-of-food",
	"🍲": "pot-of-food",
	"🫕": "fondue",
	"🥣": "bowl-with-spoon",
	"🥗": "green-salad",
	"🍿": "popcorn",
	"🧈": "butter",
	"🧂": "salt",
	"🥫": "canned-food",
	"🍱": "bento-box",
	"🍘": "rice-cracker",
	"🍙": "rice-ball",
	"🍚": "cooked-rice",
	"🍛": "curry-rice",
	"🍜": "steaming-bowl",
	"🍝": "spaghetti",
	"🍠": "roasted-sweet-potato",
	"🍢": "oden",
	"🍣": "sushi",
	"🍤": "fried-shrimp",
	"🍥": "fish-cake-with-swirl",
	"🥮": "moon-cake",
	"🍡": "dango",
	"🥟": "dumpling",
	"🥠": "fortune-cookie",
	"🥡": "takeout-box",
	"🦀": "crab",
	"🦞": "lobster",
	"🦐": "shrimp",
	"🦑": "squid",
	"🦪": "oyster",
	"🍦": "soft-ice-cream",
	"🍧": "shaved-ice",
	"🍨": "ice-cream",
	"🍩": "doughnut",
	"🍪": "cookie",
	"🎂": "birthday-cake",
	"🍰": "shortcake",
	"🧁": "cupcake",
	"🥧": "pie",
	"🍫": "chocolate-bar",
	"🍬": "candy",
	"🍭": "lollipop",
	"🍮": "custard",
	"🍯": "honey-pot",
	"🍼": "baby-bottle",
	"🥛": "glass-of-milk",
	"☕": "hot-beverage",
	"🫖": "teapot",
	"🍵": "teacup-without-handle",
	"🍶": "sake",
	"🍾": "bottle-with-popping-cork",
	"🍷": "wine-glass",
	"🍸": "cocktail-glass",
	"🍹": "tropical-drink",
	"🍺": "beer-mug",
	"🍻": "clinking-beer-mugs",
	"🥂": "clinking-glasses",
	"🥃": "tumbler-glass",
	"🫗": "pouring-liquid",
	"🥤": "cup-with-straw",
	"🧋": "bubble-tea",
	"🧃": "beverage-box",
	"🧉": "mate",
	"🧊": "ice",
	"🥢": "chopsticks",
	"🍽": "fork-and-knife-with-plate",
	"🍴": "fork-and-knife",
	"🥄": "spoon",
	"🔪": "kitchen-knife",
	"🫙": "jar",
	"🏺": "amphora",
	"🌍": "globe-showing-europe-africa",
	"🌎": "globe-showing-americas",
	"🌏": "globe-showing-asia-australia",
	"🌐": "globe-with-meridians",
	"🗺": "world-map",
	"🗾": "map-of-japan",
	"🧭": "compass",
	"🏔": "snow-capped-mountain",
	"⛰": "mountain",
	"🌋": "volcano",
	"🗻": "mount-fuji",
	"🏕": "camping",
	"🏖": "beach-with-umbrella",
	"🏜": "desert",
	"🏝": "desert-island",
	"🏞": "national-park",
	"🏟": "stadium",
	"🏛": "classical-building",
	"🏗": "building-construction",
	"🧱": "brick",
	"🪨": "rock",
	"🪵": "wood",
	"🛖": "hut",
	"🏘": "houses",
	"🏚": "derelict-house",
	"🏠": "house",
	"🏡": "house-with-garden",
	"🏢": "office-building",
	"🏣": "japanese-post-office",
	"🏤": "post-office",
	"🏥": "hospital",
	"🏦": "bank",
	"🏨": "hotel",
	"🏩": "love-hotel",
	"🏪": "convenience-store",
	"🏫": "school",
	"🏬": "department-store",
	"🏭": "factory",
	"🏯": "japanese-castle",
	"🏰": "castle",
	"💒": "wedding",
	"🗼": "tokyo-tower",
	"🗽": "statue-of-liberty",
	"⛪": "church",
	"🕌": "mosque",
	"🛕": "hindu-temple",
	"🕍": "synagogue",
	"⛩": "shinto-shrine",
	"🕋": "kaaba",
	"⛲": "fountain",
	"⛺": "tent",
	"🌁": "foggy",
	"🌃": "night-with-stars",
	"🏙": "cityscape",
	"🌄": "sunrise-over-mountains",
	"🌅": "sunrise",
	"🌆": "cityscape-at-dusk",
	"🌇": "sunset",
	"🌉": "bridge-at-night",
	"♨": "hot-springs",
	"🎠": "carousel-horse",
	"🛝": "playground-slide",
	"🎡": "ferris-wheel",
	"🎢": "roller-coaster",
	"💈": "barber-pole",
	"🎪": "circus-tent",
	"🚂": "locomotive",
	"🚃": "railway-car",
	"🚄": "high-speed-train",
	"🚅": "bullet-train",
	"🚆": "train",
	"🚇": "metro",
	"🚈": "light-rail",
	"🚉": "station",
	"🚊": "tram",
	"🚝": "monorail",
	"🚞": "mountain-railway",
	"🚋": "tram-car",
	"🚌": "bus",
	"🚍": "oncoming-bus",
	"🚎": "trolleybus",
	"🚐": "minibus",
	"🚑": "ambulance",
	"🚒": "fire-engine",
	"🚓": "police-car",
	"🚔": "oncoming-police-car",
	"🚕": "taxi",
	"🚖": "oncoming-taxi",
	"🚗": "automobile",
	"🚘": "oncoming-automobile",
	"🚙": "sport-utility-vehicle",
	"🛻": "pickup-truck",
	"🚚": "delivery-truck",
	"🚛": "articulated-lorry",
	"🚜": "tractor",
	"🏎": "racing-car",
	"🏍": "motorcycle",
	"🛵": "motor-scooter",
	"🦽": "manual-wheelchair",
	"🦼": "motorized-wheelchair",
	"🛺": "auto-rickshaw",
	"🚲": "bicycle",
	"🛴": "kick-scooter",
	"🛹": "skateboard",
	"🛼": "roller-skate",
	"🚏": "bus-stop",
	"🛣": "motorway",
	"🛤": "railway-track",
	"🛢": "oil-drum",
	"⛽": "fuel-pump",
	"🛞": "wheel",
	"🚨": "police-car-light",
	"🚥": "horizontal-traffic-light",
	"🚦": "vertical-traffic-light",
	"🛑": "stop-sign",
	"🚧": "construction",
	"⚓": "anchor",
	"🛟": "ring-buoy",
	"⛵": "sailboat",
	"🛶": "canoe",
	"🚤": "speedboat",
	"🛳": "passenger-ship",
	"⛴": "ferry",
	"🛥": "motor-boat",
	"🚢": "ship",
	"✈": "airplane",
	"🛩": "small-airplane",
	"🛫": "airplane-departure",
	"🛬": "airplane-arrival",
	"🪂": "parachute",
	"💺": "seat",
	"🚁": "helicopter",
	"🚟": "suspension-railway",
	"🚠": "mountain-cableway",
	"🚡": "aerial-tramway",
	"🛰": "satellite",
	"🚀": "rocket",
	"🛸": "flying-saucer",
	"🛎": "bellhop-bell",
	"🧳": "luggage",
	"⌛": "hourglass-done",
	"⏳": "hourglass-not-done",
	"⌚": "watch",
	"⏰": "alarm-clock",
	"⏱": "stopwatch",
	"⏲": "timer-clock",
	"🕰": "mantelpiece-clock",
	"🕛": "twelve-o-clock",
	"🕧": "twelve-thirty",
	"🕐": "one-o-clock",
	"🕜": "one-thirty",
	"🕑": "two-o-clock",
	"🕝": "two-thirty",
	"🕒": "three-o-clock",
	"🕞": "three-thirty",
	"🕓": "four-o-clock",
	"🕟": "four-thirty",
	"🕔": "five-o-clock",
	"🕠": "five-thirty",
	"🕕": "six-o-clock",
	"🕡": "six-thirty",
	"🕖": "seven-o-clock",
	"🕢": "seven-thirty",
	"🕗": "eight-o-clock",
	"🕣": "eight-thirty",
	"🕘": "nine-o-clock",
	"🕤": "nine-thirty",
	"🕙": "ten-o-clock",
	"🕥": "ten-thirty",
	"🕚": "eleven-o-clock",
	"🕦": "eleven-thirty",
	"🌑": "new-moon",
	"🌒": "waxing-crescent-moon",
	"🌓": "first-quarter-moon",
	"🌔": "waxing-gibbous-moon",
	"🌕": "full-moon",
	"🌖": "waning-gibbous-moon",
	"🌗": "last-quarter-moon",
	"🌘": "waning-crescent-moon",
	"🌙": "crescent-moon",
	"🌚": "new-moon-face",
	"🌛": "first-quarter-moon-face",
	"🌜": "last-quarter-moon-face",
	"🌡": "thermometer",
	"☀": "sun",
	"🌝": "full-moon-face",
	"🌞": "sun-with-face",
	"🪐": "ringed-planet",
	"⭐": "star",
	"🌟": "glowing-star",
	"🌠": "shooting-star",
	"🌌": "milky-way",
	"☁": "cloud",
	"⛅": "sun-behind-cloud",
	"⛈": "cloud-with-lightning-and-rain",
	"🌤": "sun-behind-small-cloud",
	"🌥": "sun-behind-large-cloud",
	"🌦": "sun-behind-rain-cloud",
	"🌧": "cloud-with-rain",
	"🌨": "cloud-with-snow",
	"🌩": "cloud-with-lightning",
	"🌪": "tornado",
	"🌫": "fog",
	"🌬": "wind-face",
	"🌀": "cyclone",
	"🌈": "rainbow",
	"🌂": "closed-umbrella",
	"☂": "umbrella",
	"☔": "umbrella-with-rain-drops",
	"⛱": "umbrella-on-ground",
	"⚡": "high-voltage",
	"❄": "snowflake",
	"☃": "snowman",
	"⛄": "snowman-without-snow",
	"☄": "comet",
	"🔥": "fire",
	"💧": "droplet",
	"🌊": "water-wave",
	"🎃": "jack-o-lantern",
	"🎄": "christmas-tree",
	"🎆": "fireworks",
	"🎇": "sparkler",
	"🧨": "firecracker",
	"✨": "sparkles",
	"🎈": "balloon",
	"🎉": "party-popper",
	"🎊": "confetti-ball",
	"🎋": "tanabata-tree",
	"🎍": "pine-decoration",
	"🎎": "japanese-dolls",
	"🎏": "carp-streamer",
	"🎐": "wind-chime",
	"🎑": "moon-viewing-ceremony",
	"🧧": "red-envelope",
	"🎀": "ribbon",
	"🎁": "wrapped-gift",
	"🎗": "reminder-ribbon",
	"🎟": "admission-tickets",
	"🎫": "ticket",
	"🎖": "military-medal",
	"🏆": "trophy",
	"🏅": "sports-medal",
	"🥇": "1st-place-medal",
	"🥈": "2nd-place-medal",
	"🥉": "3rd-place-medal",
	"⚽": "soccer-ball",
	"⚾": "baseball",
	"🥎": "softball",
	"🏀": "basketball",
	"🏐": "volleyball",
	"🏈": "american-football",
	"🏉": "rugby-football",
	"🎾": "tennis",
	"🥏": "flying-disc",
	"🎳": "bowling",
	"🏏": "cricket-game",
	"🏑": "field-hockey",
	"🏒": "ice-hockey",
	"🥍": "lacrosse",
	"🏓": "ping-pong",
	"🏸": "badminton",
	"🥊": "boxing-glove",
	"🥋": "martial-arts-uniform",
	"🥅": "goal-net",
	"⛳": "flag-in-hole",
	"⛸": "ice-skate",
	"🎣": "fishing-pole",
	"🤿": "diving-mask",
	"🎽": "running-shirt",
	"🎿": "skis",
	"🛷": "sled",
	"🥌": "curling-stone",
	"🎯": "bullseye",
	"🪀": "yo-yo",
	"🪁": "kite",
	"🔫": "water-pistol",
	"🎱": "pool-8-ball",
	"🔮": "crystal-ball",
	"🪄": "magic-wand",
	"🎮": "video-game",
	"🕹": "joystick",
	"🎰": "slot-machine",
	"🎲": "game-die",
	"🧩": "puzzle-piece",
	"🧸": "teddy-bear",
	"🪅": "piñata",
	"🪩": "mirror-ball",
	"🪆": "nesting-dolls",
	"♠": "spade-suit",
	"♥": "heart-suit",
	"♦": "diamond-suit",
	"♣": "club-suit",
	"♟": "chess-pawn",
	"🃏": "joker",
	"🀄": "mahjong-red-dragon",
	"🎴": "flower-playing-cards",
	"🎭": "performing-arts",
	"🖼": "framed-picture",
	"🎨": "artist-palette",
	"🧵": "thread",
	"🪡": "sewing-needle",
	"🧶": "yarn",
	"🪢": "knot",
	"👓": "glasses",
	"🕶": "sunglasses",
	"🥽": "goggles",
	"🥼": "lab-coat",
	"🦺": "safety-vest",
	"👔": "necktie",
	"👕": "t-shirt",
	"👖": "jeans",
	"🧣": "scarf",
	"🧤": "gloves",
	"🧥": "coat",
	"🧦": "socks",
	"👗": "dress",
	"👘": "kimono",
	"🥻": "sari",
	"🩱": "one-piece-swimsuit",
	"🩲": "briefs",
	"🩳": "shorts",
	"👙": "bikini",
	"👚": "woman-s-clothes",
	"🪭": "⊛-folding-hand-fan",
	"👛": "purse",
	"👜": "handbag",
	"👝": "clutch-bag",
	"🛍": "shopping-bags",
	"🎒": "backpack",
	"🩴": "thong-sandal",
	"👞": "man-s-shoe",
	"👟": "running-shoe",
	"🥾": "hiking-boot",
	"🥿": "flat-shoe",
	"👠": "high-heeled-shoe",
	"👡": "woman-s-sandal",
	"🩰": "ballet-shoes",
	"👢": "woman-s-boot",
	"🪮": "⊛-hair-pick",
	"👑": "crown",
	"👒": "woman-s-hat",
	"🎩": "top-hat",
	"🎓": "graduation-cap",
	"🧢": "billed-cap",
	"🪖": "military-helmet",
	"⛑": "rescue-worker-s-helmet",
	"📿": "prayer-beads",
	"💄": "lipstick",
	"💍": "ring",
	"💎": "gem-stone",
	"🔇": "muted-speaker",
	"🔈": "speaker-low-volume",
	"🔉": "speaker-medium-volume",
	"🔊": "speaker-high-volume",
	"📢": "loudspeaker",
	"📣": "megaphone",
	"📯": "postal-horn",
	"🔔": "bell",
	"🔕": "bell-with-slash",
	"🎼": "musical-score",
	"🎵": "musical-note",
	"🎶": "musical-notes",
	"🎙": "studio-microphone",
	"🎚": "level-slider",
	"🎛": "control-knobs",
	"🎤": "microphone",
	"🎧": "headphone",
	"📻": "radio",
	"🎷": "saxophone",
	"🪗": "accordion",
	"🎸": "guitar",
	"🎹": "musical-keyboard",
	"🎺": "trumpet",
	"🎻": "violin",
	"🪕": "banjo",
	"🥁": "drum",
	"🪘": "long-drum",
	"🪇": "maracas",
	"🪈": "flute",
	"📱": "mobile-phone",
	"📲": "mobile-phone-with-arrow",
	"☎": "telephone",
	"📞": "telephone-receiver",
	"📟": "pager",
	"📠": "fax-machine",
	"🔋": "battery",
	"🪫": "low-battery",
	"🔌": "electric-plug",
	"💻": "laptop",
	"🖥": "desktop-computer",
	"🖨": "printer",
	"⌨": "keyboard",
	"🖱": "computer-mouse",
	"🖲": "trackball",
	"💽": "computer-disk",
	"💾": "floppy-disk",
	"💿": "optical-disk",
	"📀": "dvd",
	"🧮": "abacus",
	"🎥": "movie-camera",
	"🎞": "film-frames",
	"📽": "film-projector",
	"🎬": "clapper-board",
	"📺": "television",
	"📷": "camera",
	"📸": "camera-with-flash",
	"📹": "video-camera",
	"📼": "videocassette",
	"🔍": "magnifying-glass-tilted-left",
	"🔎": "magnifying-glass-tilted-right",
	"🕯": "candle",
	"💡": "light-bulb",
	"🔦": "flashlight",
	"🏮": "red-paper-lantern",
	"🪔": "diya-lamp",
	"📔": "notebook-with-decorative-cover",
	"📕": "closed-book",
	"📖": "open-book",
	"📗": "green-book",
	"📘": "blue-book",
	"📙": "orange-book",
	"📚": "books",
	"📓": "notebook",
	"📒": "ledger",
	"📃": "page-with-curl",
	"📜": "scroll",
	"📄": "page-facing-up",
	"📰": "newspaper",
	"🗞": "rolled-up-newspaper",
	"📑": "bookmark-tabs",
	"🔖": "bookmark",
	"🏷": "label",
	"💰": "money-bag",
	"🪙": "coin",
	"💴": "yen-banknote",
	"💵": "dollar-banknote",
	"💶": "euro-banknote",
	"💷": "pound-banknote",
	"💸": "money-with-wings",
	"💳": "credit-card",
	"🧾": "receipt",
	"💹": "chart-increasing-with-yen",
	"✉": "envelope",
	"📧": "e-mail",
	"📨": "incoming-envelope",
	"📩": "envelope-with-arrow",
	"📤": "outbox-tray",
	"📥": "inbox-tray",
	"📦": "package",
	"📫": "closed-mailbox-with-raised-flag",
	"📪": "closed-mailbox-with-lowered-flag",
	"📬": "open-mailbox-with-raised-flag",
	"📭": "open-mailbox-with-lowered-flag",
	"📮": "postbox",
	"🗳": "ballot-box-with-ballot",
	"✏": "pencil",
	"✒": "black-nib",
	"🖋": "fountain-pen",
	"🖊": "pen",
	"🖌": "paintbrush",
	"🖍": "crayon",
	"📝": "memo",
	"💼": "briefcase",
	"📁": "file-folder",
	"📂": "open-file-folder",
	"🗂": "card-index-dividers",
	"📅": "calendar",
	"📆": "tear-off-calendar",
	"🗒": "spiral-notepad",
	"🗓": "spiral-calendar",
	"📇": "card-index",
	"📈": "chart-increasing",
	"📉": "chart-decreasing",
	"📊": "bar-chart",
	"📋": "clipboard",
	"📌": "pushpin",
	"📍": "round-pushpin",
	"📎": "paperclip",
	"🖇": "linked-paperclips",
	"📏": "straight-ruler",
	"📐": "triangular-ruler",
	"✂": "scissors",
	"🗃": "card-file-box",
	"🗄": "file-cabinet",
	"🗑": "wastebasket",
	"🔒": "locked",
	"🔓": "unlocked",
	"🔏": "locked-with-pen",
	"🔐": "locked-with-key",
	"🔑": "key",
	"🗝": "old-key",
	"🔨": "hammer",
	"🪓": "axe",
	"⛏": "pick",
	"⚒": "hammer-and-pick",
	"🛠": "hammer-and-wrench",
	"🗡": "dagger",
	"⚔": "crossed-swords",
	"💣": "bomb",
	"🪃": "boomerang",
	"🏹": "bow-and-arrow",
	"🛡": "shield",
	"🪚": "carpentry-saw",
	"🔧": "wrench",
	"🪛": "screwdriver",
	"🔩": "nut-and-bolt",
	"⚙": "gear",
	"🗜": "clamp",
	"⚖": "balance-scale",
	"🦯": "white-cane",
	"🔗": "link",
	"⛓": "chains",
	"🪝": "hook",
	"🧰": "toolbox",
	"🧲": "magnet",
	"🪜": "ladder",
	"⚗": "alembic",
	"🧪": "test-tube",
	"🧫": "petri-dish",
	"🧬": "dna",
	"🔬": "microscope",
	"🔭": "telescope",
	"📡": "satellite-antenna",
	"💉": "syringe",
	"🩸": "drop-of-blood",
	"💊": "pill",
	"🩹": "adhesive-bandage",
	"🩼": "crutch",
	"🩺": "stethoscope",
	"🩻": "x-ray",
	"🚪": "door",
	"🛗": "elevator",
	"🪞": "mirror",
	"🪟": "window",
	"🛏": "bed",
	"🛋": "couch-and-lamp",
	"🪑": "chair",
	"🚽": "toilet",
	"🪠": "plunger",
	"🚿": "shower",
	"🛁": "bathtub",
	"🪤": "mouse-trap",
	"🪒": "razor",
	"🧴": "lotion-bottle",
	"🧷": "safety-pin",
	"🧹": "broom",
	"🧺": "basket",
	"🧻": "roll-of-paper",
	"🪣": "bucket",
	"🧼": "soap",
	"🫧": "bubbles",
	"🪥": "toothbrush",
	"🧽": "sponge",
	"🧯": "fire-extinguisher",
	"🛒": "shopping-cart",
	"🚬": "cigarette",
	"⚰": "coffin",
	"🪦": "headstone",
	"⚱": "funeral-urn",
	"🧿": "nazar-amulet",
	"🪬": "hamsa",
	"🗿": "moai",
	"🪧": "placard",
	"🪪": "identification-card",
	"🏧": "atm-sign",
	"🚮": "litter-in-bin-sign",
	"🚰": "potable-water",
	"♿": "wheelchair-symbol",
	"🚹": "men-s-room",
	"🚺": "women-s-room",
	"🚻": "restroom",
	"🚼": "baby-symbol",
	"🚾": "water-closet",
	"🛂": "passport-control",
	"🛃": "customs",
	"🛄": "baggage-claim",
	"🛅": "left-luggage",
	"⚠": "warning",
	"🚸": "children-crossing",
	"⛔": "no-entry",
	"🚫": "prohibited",
	"🚳": "no-bicycles",
	"🚭": "no-smoking",
	"🚯": "no-littering",
	"🚱": "non-potable-water",
	"🚷": "no-pedestrians",
	"📵": "no-mobile-phones",
	"🔞": "no-one-under-eighteen",
	"☢": "radioactive",
	"☣": "biohazard",
	"⬆": "up-arrow",
	"↗": "up-right-arrow",
	"➡": "right-arrow",
	"↘": "down-right-arrow",
	"⬇": "down-arrow",
	"↙": "down-left-arrow",
	"⬅": "left-arrow",
	"↖": "up-left-arrow",
	"↕": "up-down-arrow",
	"↔": "left-right-arrow",
	"↩": "right-arrow-curving-left",
	"↪": "left-arrow-curving-right",
	"⤴": "right-arrow-curving-up",
	"⤵": "right-arrow-curving-down",
	"🔃": "clockwise-vertical-arrows",
	"🔄": "counterclockwise-arrows-button",
	"🔙": "back-arrow",
	"🔚": "end-arrow",
	"🔛": "on!-arrow",
	"🔜": "soon-arrow",
	"🔝": "top-arrow",
	"🛐": "place-of-worship",
	"⚛": "atom-symbol",
	"🕉": "om",
	"✡": "star-of-david",
	"☸": "wheel-of-dharma",
	"☯": "yin-yang",
	"✝": "latin-cross",
	"☦": "orthodox-cross",
	"☪": "star-and-crescent",
	"☮": "peace-symbol",
	"🕎": "menorah",
	"🔯": "dotted-six-pointed-star",
	"🪯": "⊛-khanda",
	"♈": "aries",
	"♉": "taurus",
	"♊": "gemini",
	"♋": "cancer",
	"♌": "leo",
	"♍": "virgo",
	"♎": "libra",
	"♏": "scorpio",
	"♐": "sagittarius",
	"♑": "capricorn",
	"♒": "aquarius",
	"♓": "pisces",
	"⛎": "ophiuchus",
	"🔀": "shuffle-tracks-button",
	"🔁": "repeat-button",
	"🔂": "repeat-single-button",
	"▶": "play-button",
	"⏩": "fast-forward-button",
	"⏭": "next-track-button",
	"⏯": "play-or-pause-button",
	"◀": "reverse-button",
	"⏪": "fast-reverse-button",
	"⏮": "last-track-button",
	"🔼": "upwards-button",
	"⏫": "fast-up-button",
	"🔽": "downwards-button",
	"⏬": "fast-down-button",
	"⏸": "pause-button",
	"⏹": "stop-button",
	"⏺": "record-button",
	"⏏": "eject-button",
	"🎦": "cinema",
	"🔅": "dim-button",
	"🔆": "bright-button",
	"📶": "antenna-bars",
	"🛜": "⊛-wireless",
	"📳": "vibration-mode",
	"📴": "mobile-phone-off",
	"♀": "female-sign",
	"♂": "male-sign",
	"⚧": "transgender-symbol",
	"✖": "multiply",
	"➕": "plus",
	"➖": "minus",
	"➗": "divide",
	"🟰": "heavy-equals-sign",
	"♾": "infinity",
	"‼": "double-exclamation-mark",
	"⁉": "exclamation-question-mark",
	"❓": "red-question-mark",
	"❔": "white-question-mark",
	"❕": "white-exclamation-mark",
	"❗": "red-exclamation-mark",
	"〰": "wavy-dash",
	"💱": "currency-exchange",
	"💲": "heavy-dollar-sign",
	"⚕": "medical-symbol",
	"♻": "recycling-symbol",
	"⚜": "fleur-de-lis",
	"🔱": "trident-emblem",
	"📛": "name-badge",
	"🔰": "japanese-symbol-for-beginner",
	"⭕": "hollow-red-circle",
	"✅": "check-mark-button",
	"☑": "check-box-with-check",
	"✔": "check-mark",
	"❌": "cross-mark",
	"❎": "cross-mark-button",
	"➰": "curly-loop",
	"➿": "double-curly-loop",
	"〽": "part-alternation-mark",
	"✳": "eight-spoked-asterisk",
	"✴": "eight-pointed-star",
	"❇": "sparkle",
	"©": "copyright",
	"®": "registered",
	"™": "trade-mark",
	"#️⃣": "keycap-#",
	"*️⃣": "keycap-*",
	"0️⃣": "keycap-0",
	"1️⃣": "keycap-1",
	"2️⃣": "keycap-2",
	"3️⃣": "keycap-3",
	"4️⃣": "keycap-4",
	"5️⃣": "keycap-5",
	"6️⃣": "keycap-6",
	"7️⃣": "keycap-7",
	"8️⃣": "keycap-8",
	"9️⃣": "keycap-9",
	"🔟": "keycap-10",
	"🔠": "input-latin-uppercase",
	"🔡": "input-latin-lowercase",
	"🔢": "input-numbers",
	"🔣": "input-symbols",
	"🔤": "input-latin-letters",
	"🅰": "a-button-(blood-type)",
	"🆎": "ab-button-(blood-type)",
	"🅱": "b-button-(blood-type)",
	"🆑": "cl-button",
	"🆒": "cool-button",
	"🆓": "free-button",
	ℹ: "information",
	"🆔": "id-button",
	"Ⓜ": "circled-m",
	"🆕": "new-button",
	"🆖": "ng-button",
	"🅾": "o-button-(blood-type)",
	"🆗": "ok-button",
	"🅿": "p-button",
	"🆘": "sos-button",
	"🆙": "up!-button",
	"🆚": "vs-button",
	"🈁": "japanese-here-button",
	"🈂": "japanese-service-charge-button",
	"🈷": "japanese-monthly-amount-button",
	"🈶": "japanese-not-free-of-charge-button",
	"🈯": "japanese-reserved-button",
	"🉐": "japanese-bargain-button",
	"🈹": "japanese-discount-button",
	"🈚": "japanese-free-of-charge-button",
	"🈲": "japanese-prohibited-button",
	"🉑": "japanese-acceptable-button",
	"🈸": "japanese-application-button",
	"🈴": "japanese-passing-grade-button",
	"🈳": "japanese-vacancy-button",
	"㊗": "japanese-congratulations-button",
	"㊙": "japanese-secret-button",
	"🈺": "japanese-open-for-business-button",
	"🈵": "japanese-no-vacancy-button",
	"🔴": "red-circle",
	"🟠": "orange-circle",
	"🟡": "yellow-circle",
	"🟢": "green-circle",
	"🔵": "blue-circle",
	"🟣": "purple-circle",
	"🟤": "brown-circle",
	"⚫": "black-circle",
	"⚪": "white-circle",
	"🟥": "red-square",
	"🟧": "orange-square",
	"🟨": "yellow-square",
	"🟩": "green-square",
	"🟦": "blue-square",
	"🟪": "purple-square",
	"🟫": "brown-square",
	"⬛": "black-large-square",
	"⬜": "white-large-square",
	"◼": "black-medium-square",
	"◻": "white-medium-square",
	"◾": "black-medium-small-square",
	"◽": "white-medium-small-square",
	"▪": "black-small-square",
	"▫": "white-small-square",
	"🔶": "large-orange-diamond",
	"🔷": "large-blue-diamond",
	"🔸": "small-orange-diamond",
	"🔹": "small-blue-diamond",
	"🔺": "red-triangle-pointed-up",
	"🔻": "red-triangle-pointed-down",
	"💠": "diamond-with-a-dot",
	"🔘": "radio-button",
	"🔳": "white-square-button",
	"🔲": "black-square-button",
	"🏁": "chequered-flag",
	"🚩": "triangular-flag",
	"🎌": "crossed-flags",
	"🏴": "black-flag",
	"🏳": "white-flag",
	"🏳️‍🌈": "rainbow-flag",
	"🏳️‍⚧️": "transgender-flag",
	"🏴‍☠️": "pirate-flag",
	"🇦🇨": "flag-ascension-island",
	"🇦🇩": "flag-andorra",
	"🇦🇪": "flag-united-arab-emirates",
	"🇦🇫": "flag-afghanistan",
	"🇦🇬": "flag-antigua-and-barbuda",
	"🇦🇮": "flag-anguilla",
	"🇦🇱": "flag-albania",
	"🇦🇲": "flag-armenia",
	"🇦🇴": "flag-angola",
	"🇦🇶": "flag-antarctica",
	"🇦🇷": "flag-argentina",
	"🇦🇸": "flag-american-samoa",
	"🇦🇹": "flag-austria",
	"🇦🇺": "flag-australia",
	"🇦🇼": "flag-aruba",
	"🇦🇽": "flag-åland-islands",
	"🇦🇿": "flag-azerbaijan",
	"🇧🇦": "flag-bosnia-and-herzegovina",
	"🇧🇧": "flag-barbados",
	"🇧🇩": "flag-bangladesh",
	"🇧🇪": "flag-belgium",
	"🇧🇫": "flag-burkina-faso",
	"🇧🇬": "flag-bulgaria",
	"🇧🇭": "flag-bahrain",
	"🇧🇮": "flag-burundi",
	"🇧🇯": "flag-benin",
	"🇧🇱": "flag-st-barthelemy",
	"🇧🇲": "flag-bermuda",
	"🇧🇳": "flag-brunei",
	"🇧🇴": "flag-bolivia",
	"🇧🇶": "flag-caribbean-netherlands",
	"🇧🇷": "flag-brazil",
	"🇧🇸": "flag-bahamas",
	"🇧🇹": "flag-bhutan",
	"🇧🇻": "flag-bouvet-island",
	"🇧🇼": "flag-botswana",
	"🇧🇾": "flag-belarus",
	"🇧🇿": "flag-belize",
	"🇨🇦": "flag-canada",
	"🇨🇨": "flag-cocos-(keeling)-islands",
	"🇨🇩": "flag-congo---kinshasa",
	"🇨🇫": "flag-central-african-republic",
	"🇨🇬": "flag-congo---brazzaville",
	"🇨🇭": "flag-switzerland",
	"🇨🇮": "flag-côte-d-ivoire",
	"🇨🇰": "flag-cook-islands",
	"🇨🇱": "flag-chile",
	"🇨🇲": "flag-cameroon",
	"🇨🇳": "flag-china",
	"🇨🇴": "flag-colombia",
	"🇨🇵": "flag-clipperton-island",
	"🇨🇷": "flag-costa-rica",
	"🇨🇺": "flag-cuba",
	"🇨🇻": "flag-cape-verde",
	"🇨🇼": "flag-curaçao",
	"🇨🇽": "flag-christmas-island",
	"🇨🇾": "flag-cyprus",
	"🇨🇿": "flag-czechia",
	"🇩🇪": "flag-germany",
	"🇩🇬": "flag-diego-garcia",
	"🇩🇯": "flag-djibouti",
	"🇩🇰": "flag-denmark",
	"🇩🇲": "flag-dominica",
	"🇩🇴": "flag-dominican-republic",
	"🇩🇿": "flag-algeria",
	"🇪🇦": "flag-ceuta-and-melilla",
	"🇪🇨": "flag-ecuador",
	"🇪🇪": "flag-estonia",
	"🇪🇬": "flag-egypt",
	"🇪🇭": "flag-western-sahara",
	"🇪🇷": "flag-eritrea",
	"🇪🇸": "flag-spain",
	"🇪🇹": "flag-ethiopia",
	"🇪🇺": "flag-european-union",
	"🇫🇮": "flag-finland",
	"🇫🇯": "flag-fiji",
	"🇫🇰": "flag-falkland-islands",
	"🇫🇲": "flag-micronesia",
	"🇫🇴": "flag-faroe-islands",
	"🇫🇷": "flag-france",
	"🇬🇦": "flag-gabon",
	"🇬🇧": "flag-united-kingdom",
	"🇬🇩": "flag-grenada",
	"🇬🇪": "flag-georgia",
	"🇬🇫": "flag-french-guiana",
	"🇬🇬": "flag-guernsey",
	"🇬🇭": "flag-ghana",
	"🇬🇮": "flag-gibraltar",
	"🇬🇱": "flag-greenland",
	"🇬🇲": "flag-gambia",
	"🇬🇳": "flag-guinea",
	"🇬🇵": "flag-guadeloupe",
	"🇬🇶": "flag-equatorial-guinea",
	"🇬🇷": "flag-greece",
	"🇬🇸": "flag-south-georgia-and-south-sandwich-islands",
	"🇬🇹": "flag-guatemala",
	"🇬🇺": "flag-guam",
	"🇬🇼": "flag-guinea-bissau",
	"🇬🇾": "flag-guyana",
	"🇭🇰": "flag-hong-kong-sar-china",
	"🇭🇲": "flag-heard-and-mcdonald-islands",
	"🇭🇳": "flag-honduras",
	"🇭🇷": "flag-croatia",
	"🇭🇹": "flag-haiti",
	"🇭🇺": "flag-hungary",
	"🇮🇨": "flag-canary-islands",
	"🇮🇩": "flag-indonesia",
	"🇮🇪": "flag-ireland",
	"🇮🇱": "flag-israel",
	"🇮🇲": "flag-isle-of-man",
	"🇮🇳": "flag-india",
	"🇮🇴": "flag-british-indian-ocean-territory",
	"🇮🇶": "flag-iraq",
	"🇮🇷": "flag-iran",
	"🇮🇸": "flag-iceland",
	"🇮🇹": "flag-italy",
	"🇯🇪": "flag-jersey",
	"🇯🇲": "flag-jamaica",
	"🇯🇴": "flag-jordan",
	"🇯🇵": "flag-japan",
	"🇰🇪": "flag-kenya",
	"🇰🇬": "flag-kyrgyzstan",
	"🇰🇭": "flag-cambodia",
	"🇰🇮": "flag-kiribati",
	"🇰🇲": "flag-comoros",
	"🇰🇳": "flag-st-kitts-and-nevis",
	"🇰🇵": "flag-north-korea",
	"🇰🇷": "flag-south-korea",
	"🇰🇼": "flag-kuwait",
	"🇰🇾": "flag-cayman-islands",
	"🇰🇿": "flag-kazakhstan",
	"🇱🇦": "flag-laos",
	"🇱🇧": "flag-lebanon",
	"🇱🇨": "flag-st-lucia",
	"🇱🇮": "flag-liechtenstein",
	"🇱🇰": "flag-sri-lanka",
	"🇱🇷": "flag-liberia",
	"🇱🇸": "flag-lesotho",
	"🇱🇹": "flag-lithuania",
	"🇱🇺": "flag-luxembourg",
	"🇱🇻": "flag-latvia",
	"🇱🇾": "flag-libya",
	"🇲🇦": "flag-morocco",
	"🇲🇨": "flag-monaco",
	"🇲🇩": "flag-moldova",
	"🇲🇪": "flag-montenegro",
	"🇲🇫": "flag-st-martin",
	"🇲🇬": "flag-madagascar",
	"🇲🇭": "flag-marshall-islands",
	"🇲🇰": "flag-north-macedonia",
	"🇲🇱": "flag-mali",
	"🇲🇲": "flag-myanmar-(burma)",
	"🇲🇳": "flag-mongolia",
	"🇲🇴": "flag-macao-sar-china",
	"🇲🇵": "flag-northern-mariana-islands",
	"🇲🇶": "flag-martinique",
	"🇲🇷": "flag-mauritania",
	"🇲🇸": "flag-montserrat",
	"🇲🇹": "flag-malta",
	"🇲🇺": "flag-mauritius",
	"🇲🇻": "flag-maldives",
	"🇲🇼": "flag-malawi",
	"🇲🇽": "flag-mexico",
	"🇲🇾": "flag-malaysia",
	"🇲🇿": "flag-mozambique",
	"🇳🇦": "flag-namibia",
	"🇳🇨": "flag-new-caledonia",
	"🇳🇪": "flag-niger",
	"🇳🇫": "flag-norfolk-island",
	"🇳🇬": "flag-nigeria",
	"🇳🇮": "flag-nicaragua",
	"🇳🇱": "flag-netherlands",
	"🇳🇴": "flag-norway",
	"🇳🇵": "flag-nepal",
	"🇳🇷": "flag-nauru",
	"🇳🇺": "flag-niue",
	"🇳🇿": "flag-new-zealand",
	"🇴🇲": "flag-oman",
	"🇵🇦": "flag-panama",
	"🇵🇪": "flag-peru",
	"🇵🇫": "flag-french-polynesia",
	"🇵🇬": "flag-papua-new-guinea",
	"🇵🇭": "flag-philippines",
	"🇵🇰": "flag-pakistan",
	"🇵🇱": "flag-poland",
	"🇵🇲": "flag-st-pierre-and-miquelon",
	"🇵🇳": "flag-pitcairn-islands",
	"🇵🇷": "flag-puerto-rico",
	"🇵🇸": "flag-palestinian-territories",
	"🇵🇹": "flag-portugal",
	"🇵🇼": "flag-palau",
	"🇵🇾": "flag-paraguay",
	"🇶🇦": "flag-qatar",
	"🇷🇪": "flag-reunion",
	"🇷🇴": "flag-romania",
	"🇷🇸": "flag-serbia",
	"🇷🇺": "flag-russia",
	"🇷🇼": "flag-rwanda",
	"🇸🇦": "flag-saudi-arabia",
	"🇸🇧": "flag-solomon-islands",
	"🇸🇨": "flag-seychelles",
	"🇸🇩": "flag-sudan",
	"🇸🇪": "flag-sweden",
	"🇸🇬": "flag-singapore",
	"🇸🇭": "flag-st-helena",
	"🇸🇮": "flag-slovenia",
	"🇸🇯": "flag-svalbard-and-jan-mayen",
	"🇸🇰": "flag-slovakia",
	"🇸🇱": "flag-sierra-leone",
	"🇸🇲": "flag-san-marino",
	"🇸🇳": "flag-senegal",
	"🇸🇴": "flag-somalia",
	"🇸🇷": "flag-suriname",
	"🇸🇸": "flag-south-sudan",
	"🇸🇹": "flag-são-tome-and-príncipe",
	"🇸🇻": "flag-el-salvador",
	"🇸🇽": "flag-sint-maarten",
	"🇸🇾": "flag-syria",
	"🇸🇿": "flag-eswatini",
	"🇹🇦": "flag-tristan-da-cunha",
	"🇹🇨": "flag-turks-and-caicos-islands",
	"🇹🇩": "flag-chad",
	"🇹🇫": "flag-french-southern-territories",
	"🇹🇬": "flag-togo",
	"🇹🇭": "flag-thailand",
	"🇹🇯": "flag-tajikistan",
	"🇹🇰": "flag-tokelau",
	"🇹🇱": "flag-timor-leste",
	"🇹🇲": "flag-turkmenistan",
	"🇹🇳": "flag-tunisia",
	"🇹🇴": "flag-tonga",
	"🇹🇷": "flag-turkey",
	"🇹🇹": "flag-trinidad-and-tobago",
	"🇹🇻": "flag-tuvalu",
	"🇹🇼": "flag-taiwan",
	"🇹🇿": "flag-tanzania",
	"🇺🇦": "flag-ukraine",
	"🇺🇬": "flag-uganda",
	"🇺🇲": "flag-us-outlying-islands",
	"🇺🇳": "flag-united-nations",
	"🇺🇸": "flag-united-states",
	"🇺🇾": "flag-uruguay",
	"🇺🇿": "flag-uzbekistan",
	"🇻🇦": "flag-vatican-city",
	"🇻🇨": "flag-st-vincent-and-grenadines",
	"🇻🇪": "flag-venezuela",
	"🇻🇬": "flag-british-virgin-islands",
	"🇻🇮": "flag-us-virgin-islands",
	"🇻🇳": "flag-vietnam",
	"🇻🇺": "flag-vanuatu",
	"🇼🇫": "flag-wallis-and-futuna",
	"🇼🇸": "flag-samoa",
	"🇽🇰": "flag-kosovo",
	"🇾🇪": "flag-yemen",
	"🇾🇹": "flag-mayotte",
	"🇿🇦": "flag-south-africa",
	"🇿🇲": "flag-zambia",
	"🇿🇼": "flag-zimbabwe",
	"🏴󠁧󠁢󠁥󠁮󠁧󠁿": "flag-england",
	"🏴󠁧󠁢󠁳󠁣󠁴󠁿": "flag-scotland",
	"🏴󠁧󠁢󠁷󠁬󠁳󠁿": "flag-wales"
};
const EMOJIS = Object.keys(EMOJI_NAMES);

// https://publicsuffix.org/list/public_suffix_list.dat

const PUBLIC_SUFFIX_LIST = `
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Please pull this list from, and only from https://publicsuffix.org/list/public_suffix_list.dat,
// rather than any other VCS sites. Pulling from any other URL is not guaranteed to be supported.

// Instructions on pulling and using this list can be found at https://publicsuffix.org/list/.

// ===BEGIN ICANN DOMAINS===

// ac : http://nic.ac/rules.htm
ac
com.ac
edu.ac
gov.ac
net.ac
mil.ac
org.ac

// ad : https://en.wikipedia.org/wiki/.ad
ad
nom.ad

// ae : https://tdra.gov.ae/en/aeda/ae-policies
ae
co.ae
net.ae
org.ae
sch.ae
ac.ae
gov.ae
mil.ae

// aero : see https://www.information.aero/index.php?id=66
aero
accident-investigation.aero
accident-prevention.aero
aerobatic.aero
aeroclub.aero
aerodrome.aero
agents.aero
aircraft.aero
airline.aero
airport.aero
air-surveillance.aero
airtraffic.aero
air-traffic-control.aero
ambulance.aero
amusement.aero
association.aero
author.aero
ballooning.aero
broker.aero
caa.aero
cargo.aero
catering.aero
certification.aero
championship.aero
charter.aero
civilaviation.aero
club.aero
conference.aero
consultant.aero
consulting.aero
control.aero
council.aero
crew.aero
design.aero
dgca.aero
educator.aero
emergency.aero
engine.aero
engineer.aero
entertainment.aero
equipment.aero
exchange.aero
express.aero
federation.aero
flight.aero
fuel.aero
gliding.aero
government.aero
groundhandling.aero
group.aero
hanggliding.aero
homebuilt.aero
insurance.aero
journal.aero
journalist.aero
leasing.aero
logistics.aero
magazine.aero
maintenance.aero
media.aero
microlight.aero
modelling.aero
navigation.aero
parachuting.aero
paragliding.aero
passenger-association.aero
pilot.aero
press.aero
production.aero
recreation.aero
repbody.aero
res.aero
research.aero
rotorcraft.aero
safety.aero
scientist.aero
services.aero
show.aero
skydiving.aero
software.aero
student.aero
trader.aero
trading.aero
trainer.aero
union.aero
workinggroup.aero
works.aero

// af : http://www.nic.af/help.jsp
af
gov.af
com.af
org.af
net.af
edu.af

// ag : http://www.nic.ag/prices.htm
ag
com.ag
org.ag
net.ag
co.ag
nom.ag

// ai : http://nic.com.ai/
ai
off.ai
com.ai
net.ai
org.ai

// al : http://www.ert.gov.al/ert_alb/faq_det.html?Id=31
al
com.al
edu.al
gov.al
mil.al
net.al
org.al

// am : https://www.amnic.net/policy/en/Policy_EN.pdf
am
co.am
com.am
commune.am
net.am
org.am

// ao : https://en.wikipedia.org/wiki/.ao
// http://www.dns.ao/REGISTR.DOC
ao
ed.ao
gv.ao
og.ao
co.ao
pb.ao
it.ao

// aq : https://en.wikipedia.org/wiki/.aq
aq

// ar : https://nic.ar/es/nic-argentina/normativa
ar
bet.ar
com.ar
coop.ar
edu.ar
gob.ar
gov.ar
int.ar
mil.ar
musica.ar
mutual.ar
net.ar
org.ar
senasa.ar
tur.ar

// arpa : https://en.wikipedia.org/wiki/.arpa
// Confirmed by registry <iana-questions@icann.org> 2008-06-18
arpa
e164.arpa
in-addr.arpa
ip6.arpa
iris.arpa
uri.arpa
urn.arpa

// as : https://en.wikipedia.org/wiki/.as
as
gov.as

// asia : https://en.wikipedia.org/wiki/.asia
asia

// at : https://en.wikipedia.org/wiki/.at
// Confirmed by registry <it@nic.at> 2008-06-17
at
ac.at
co.at
gv.at
or.at
sth.ac.at

// au : https://en.wikipedia.org/wiki/.au
// http://www.auda.org.au/
au
// 2LDs
com.au
net.au
org.au
edu.au
gov.au
asn.au
id.au
// Historic 2LDs (closed to new registration, but sites still exist)
info.au
conf.au
oz.au
// CGDNs - http://www.cgdn.org.au/
act.au
nsw.au
nt.au
qld.au
sa.au
tas.au
vic.au
wa.au
// 3LDs
act.edu.au
catholic.edu.au
// eq.edu.au - Removed at the request of the Queensland Department of Education
nsw.edu.au
nt.edu.au
qld.edu.au
sa.edu.au
tas.edu.au
vic.edu.au
wa.edu.au
// act.gov.au  Bug 984824 - Removed at request of Greg Tankard
// nsw.gov.au  Bug 547985 - Removed at request of <Shae.Donelan@services.nsw.gov.au>
// nt.gov.au  Bug 940478 - Removed at request of Greg Connors <Greg.Connors@nt.gov.au>
qld.gov.au
sa.gov.au
tas.gov.au
vic.gov.au
wa.gov.au
// 4LDs
// education.tas.edu.au - Removed at the request of the Department of Education Tasmania
schools.nsw.edu.au

// aw : https://en.wikipedia.org/wiki/.aw
aw
com.aw

// ax : https://en.wikipedia.org/wiki/.ax
ax

// az : https://en.wikipedia.org/wiki/.az
az
com.az
net.az
int.az
gov.az
org.az
edu.az
info.az
pp.az
mil.az
name.az
pro.az
biz.az

// ba : http://nic.ba/users_data/files/pravilnik_o_registraciji.pdf
ba
com.ba
edu.ba
gov.ba
mil.ba
net.ba
org.ba

// bb : https://en.wikipedia.org/wiki/.bb
bb
biz.bb
co.bb
com.bb
edu.bb
gov.bb
info.bb
net.bb
org.bb
store.bb
tv.bb

// bd : https://en.wikipedia.org/wiki/.bd
*.bd

// be : https://en.wikipedia.org/wiki/.be
// Confirmed by registry <tech@dns.be> 2008-06-08
be
ac.be

// bf : https://en.wikipedia.org/wiki/.bf
bf
gov.bf

// bg : https://en.wikipedia.org/wiki/.bg
// https://www.register.bg/user/static/rules/en/index.html
bg
a.bg
b.bg
c.bg
d.bg
e.bg
f.bg
g.bg
h.bg
i.bg
j.bg
k.bg
l.bg
m.bg
n.bg
o.bg
p.bg
q.bg
r.bg
s.bg
t.bg
u.bg
v.bg
w.bg
x.bg
y.bg
z.bg
0.bg
1.bg
2.bg
3.bg
4.bg
5.bg
6.bg
7.bg
8.bg
9.bg

// bh : https://en.wikipedia.org/wiki/.bh
bh
com.bh
edu.bh
net.bh
org.bh
gov.bh

// bi : https://en.wikipedia.org/wiki/.bi
// http://whois.nic.bi/
bi
co.bi
com.bi
edu.bi
or.bi
org.bi

// biz : https://en.wikipedia.org/wiki/.biz
biz

// bj : https://nic.bj/bj-suffixes.txt
// submitted by registry <contact@nic.bj>
bj
africa.bj
agro.bj
architectes.bj
assur.bj
avocats.bj
co.bj
com.bj
eco.bj
econo.bj
edu.bj
info.bj
loisirs.bj
money.bj
net.bj
org.bj
ote.bj
resto.bj
restaurant.bj
tourism.bj
univ.bj

// bm : http://www.bermudanic.bm/dnr-text.txt
bm
com.bm
edu.bm
gov.bm
net.bm
org.bm

// bn : http://www.bnnic.bn/faqs
bn
com.bn
edu.bn
gov.bn
net.bn
org.bn

// bo : https://nic.bo/delegacion2015.php#h-1.10
bo
com.bo
edu.bo
gob.bo
int.bo
org.bo
net.bo
mil.bo
tv.bo
web.bo
// Social Domains
academia.bo
agro.bo
arte.bo
blog.bo
bolivia.bo
ciencia.bo
cooperativa.bo
democracia.bo
deporte.bo
ecologia.bo
economia.bo
empresa.bo
indigena.bo
industria.bo
info.bo
medicina.bo
movimiento.bo
musica.bo
natural.bo
nombre.bo
noticias.bo
patria.bo
politica.bo
profesional.bo
plurinacional.bo
pueblo.bo
revista.bo
salud.bo
tecnologia.bo
tksat.bo
transporte.bo
wiki.bo

// br : http://registro.br/dominio/categoria.html
// Submitted by registry <fneves@registro.br>
br
9guacu.br
abc.br
adm.br
adv.br
agr.br
aju.br
am.br
anani.br
aparecida.br
app.br
arq.br
art.br
ato.br
b.br
barueri.br
belem.br
bhz.br
bib.br
bio.br
blog.br
bmd.br
boavista.br
bsb.br
campinagrande.br
campinas.br
caxias.br
cim.br
cng.br
cnt.br
com.br
contagem.br
coop.br
coz.br
cri.br
cuiaba.br
curitiba.br
def.br
des.br
det.br
dev.br
ecn.br
eco.br
edu.br
emp.br
enf.br
eng.br
esp.br
etc.br
eti.br
far.br
feira.br
flog.br
floripa.br
fm.br
fnd.br
fortal.br
fot.br
foz.br
fst.br
g12.br
geo.br
ggf.br
goiania.br
gov.br
// gov.br 26 states + df https://en.wikipedia.org/wiki/States_of_Brazil
ac.gov.br
al.gov.br
am.gov.br
ap.gov.br
ba.gov.br
ce.gov.br
df.gov.br
es.gov.br
go.gov.br
ma.gov.br
mg.gov.br
ms.gov.br
mt.gov.br
pa.gov.br
pb.gov.br
pe.gov.br
pi.gov.br
pr.gov.br
rj.gov.br
rn.gov.br
ro.gov.br
rr.gov.br
rs.gov.br
sc.gov.br
se.gov.br
sp.gov.br
to.gov.br
gru.br
imb.br
ind.br
inf.br
jab.br
jampa.br
jdf.br
joinville.br
jor.br
jus.br
leg.br
lel.br
log.br
londrina.br
macapa.br
maceio.br
manaus.br
maringa.br
mat.br
med.br
mil.br
morena.br
mp.br
mus.br
natal.br
net.br
niteroi.br
*.nom.br
not.br
ntr.br
odo.br
ong.br
org.br
osasco.br
palmas.br
poa.br
ppg.br
pro.br
psc.br
psi.br
pvh.br
qsl.br
radio.br
rec.br
recife.br
rep.br
ribeirao.br
rio.br
riobranco.br
riopreto.br
salvador.br
sampa.br
santamaria.br
santoandre.br
saobernardo.br
saogonca.br
seg.br
sjc.br
slg.br
slz.br
sorocaba.br
srv.br
taxi.br
tc.br
tec.br
teo.br
the.br
tmp.br
trd.br
tur.br
tv.br
udi.br
vet.br
vix.br
vlog.br
wiki.br
zlg.br

// bs : http://www.nic.bs/rules.html
bs
com.bs
net.bs
org.bs
edu.bs
gov.bs

// bt : https://en.wikipedia.org/wiki/.bt
bt
com.bt
edu.bt
gov.bt
net.bt
org.bt

// bv : No registrations at this time.
// Submitted by registry <jarle@uninett.no>
bv

// bw : https://en.wikipedia.org/wiki/.bw
// http://www.gobin.info/domainname/bw.doc
// list of other 2nd level tlds ?
bw
co.bw
org.bw

// by : https://en.wikipedia.org/wiki/.by
// http://tld.by/rules_2006_en.html
// list of other 2nd level tlds ?
by
gov.by
mil.by
// Official information does not indicate that com.by is a reserved
// second-level domain, but it's being used as one (see www.google.com.by and
// www.yahoo.com.by, for example), so we list it here for safety's sake.
com.by

// http://hoster.by/
of.by

// bz : https://en.wikipedia.org/wiki/.bz
// http://www.belizenic.bz/
bz
com.bz
net.bz
org.bz
edu.bz
gov.bz

// ca : https://en.wikipedia.org/wiki/.ca
ca
// ca geographical names
ab.ca
bc.ca
mb.ca
nb.ca
nf.ca
nl.ca
ns.ca
nt.ca
nu.ca
on.ca
pe.ca
qc.ca
sk.ca
yk.ca
// gc.ca: https://en.wikipedia.org/wiki/.gc.ca
// see also: http://registry.gc.ca/en/SubdomainFAQ
gc.ca

// cat : https://en.wikipedia.org/wiki/.cat
cat

// cc : https://en.wikipedia.org/wiki/.cc
cc

// cd : https://en.wikipedia.org/wiki/.cd
// see also: https://www.nic.cd/domain/insertDomain_2.jsp?act=1
cd
gov.cd

// cf : https://en.wikipedia.org/wiki/.cf
cf

// cg : https://en.wikipedia.org/wiki/.cg
cg

// ch : https://en.wikipedia.org/wiki/.ch
ch

// ci : https://en.wikipedia.org/wiki/.ci
// http://www.nic.ci/index.php?page=charte
ci
org.ci
or.ci
com.ci
co.ci
edu.ci
ed.ci
ac.ci
net.ci
go.ci
asso.ci
aéroport.ci
int.ci
presse.ci
md.ci
gouv.ci

// ck : https://en.wikipedia.org/wiki/.ck
*.ck
!www.ck

// cl : https://www.nic.cl
// Confirmed by .CL registry <hsalgado@nic.cl>
cl
co.cl
gob.cl
gov.cl
mil.cl

// cm : https://en.wikipedia.org/wiki/.cm plus bug 981927
cm
co.cm
com.cm
gov.cm
net.cm

// cn : https://en.wikipedia.org/wiki/.cn
// Submitted by registry <tanyaling@cnnic.cn>
cn
ac.cn
com.cn
edu.cn
gov.cn
net.cn
org.cn
mil.cn
公司.cn
网络.cn
網絡.cn
// cn geographic names
ah.cn
bj.cn
cq.cn
fj.cn
gd.cn
gs.cn
gz.cn
gx.cn
ha.cn
hb.cn
he.cn
hi.cn
hl.cn
hn.cn
jl.cn
js.cn
jx.cn
ln.cn
nm.cn
nx.cn
qh.cn
sc.cn
sd.cn
sh.cn
sn.cn
sx.cn
tj.cn
xj.cn
xz.cn
yn.cn
zj.cn
hk.cn
mo.cn
tw.cn

// co : https://en.wikipedia.org/wiki/.co
// Submitted by registry <tecnico@uniandes.edu.co>
co
arts.co
com.co
edu.co
firm.co
gov.co
info.co
int.co
mil.co
net.co
nom.co
org.co
rec.co
web.co

// com : https://en.wikipedia.org/wiki/.com
com

// coop : https://en.wikipedia.org/wiki/.coop
coop

// cr : http://www.nic.cr/niccr_publico/showRegistroDominiosScreen.do
cr
ac.cr
co.cr
ed.cr
fi.cr
go.cr
or.cr
sa.cr

// cu : https://en.wikipedia.org/wiki/.cu
cu
com.cu
edu.cu
org.cu
net.cu
gov.cu
inf.cu

// cv : https://en.wikipedia.org/wiki/.cv
// cv : http://www.dns.cv/tldcv_portal/do?com=DS;5446457100;111;+PAGE(4000018)+K-CAT-CODIGO(RDOM)+RCNT(100); <- registration rules
cv
com.cv
edu.cv
int.cv
nome.cv
org.cv

// cw : http://www.una.cw/cw_registry/
// Confirmed by registry <registry@una.net> 2013-03-26
cw
com.cw
edu.cw
net.cw
org.cw

// cx : https://en.wikipedia.org/wiki/.cx
// list of other 2nd level tlds ?
cx
gov.cx

// cy : http://www.nic.cy/
// Submitted by registry Panayiotou Fotia <cydns@ucy.ac.cy>
// namespace policies URL https://www.nic.cy/portal//sites/default/files/symfonia_gia_eggrafi.pdf
cy
ac.cy
biz.cy
com.cy
ekloges.cy
gov.cy
ltd.cy
mil.cy
net.cy
org.cy
press.cy
pro.cy
tm.cy

// cz : https://en.wikipedia.org/wiki/.cz
cz

// de : https://en.wikipedia.org/wiki/.de
// Confirmed by registry <ops@denic.de> (with technical
// reservations) 2008-07-01
de

// dj : https://en.wikipedia.org/wiki/.dj
dj

// dk : https://en.wikipedia.org/wiki/.dk
// Confirmed by registry <robert@dk-hostmaster.dk> 2008-06-17
dk

// dm : https://en.wikipedia.org/wiki/.dm
dm
com.dm
net.dm
org.dm
edu.dm
gov.dm

// do : https://en.wikipedia.org/wiki/.do
do
art.do
com.do
edu.do
gob.do
gov.do
mil.do
net.do
org.do
sld.do
web.do

// dz : http://www.nic.dz/images/pdf_nic/charte.pdf
dz
art.dz
asso.dz
com.dz
edu.dz
gov.dz
org.dz
net.dz
pol.dz
soc.dz
tm.dz

// ec : http://www.nic.ec/reg/paso1.asp
// Submitted by registry <vabboud@nic.ec>
ec
com.ec
info.ec
net.ec
fin.ec
k12.ec
med.ec
pro.ec
org.ec
edu.ec
gov.ec
gob.ec
mil.ec

// edu : https://en.wikipedia.org/wiki/.edu
edu

// ee : http://www.eenet.ee/EENet/dom_reeglid.html#lisa_B
ee
edu.ee
gov.ee
riik.ee
lib.ee
med.ee
com.ee
pri.ee
aip.ee
org.ee
fie.ee

// eg : https://en.wikipedia.org/wiki/.eg
eg
com.eg
edu.eg
eun.eg
gov.eg
mil.eg
name.eg
net.eg
org.eg
sci.eg

// er : https://en.wikipedia.org/wiki/.er
*.er

// es : https://www.nic.es/site_ingles/ingles/dominios/index.html
es
com.es
nom.es
org.es
gob.es
edu.es

// et : https://en.wikipedia.org/wiki/.et
et
com.et
gov.et
org.et
edu.et
biz.et
name.et
info.et
net.et

// eu : https://en.wikipedia.org/wiki/.eu
eu

// fi : https://en.wikipedia.org/wiki/.fi
fi
// aland.fi : https://en.wikipedia.org/wiki/.ax
// This domain is being phased out in favor of .ax. As there are still many
// domains under aland.fi, we still keep it on the list until aland.fi is
// completely removed.
// TODO: Check for updates (expected to be phased out around Q1/2009)
aland.fi

// fj : http://domains.fj/
// Submitted by registry <garth.miller@cocca.org.nz> 2020-02-11
fj
ac.fj
biz.fj
com.fj
gov.fj
info.fj
mil.fj
name.fj
net.fj
org.fj
pro.fj

// fk : https://en.wikipedia.org/wiki/.fk
*.fk

// fm : https://en.wikipedia.org/wiki/.fm
com.fm
edu.fm
net.fm
org.fm
fm

// fo : https://en.wikipedia.org/wiki/.fo
fo

// fr : https://www.afnic.fr/ https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
fr
asso.fr
com.fr
gouv.fr
nom.fr
prd.fr
tm.fr
// Other SLDs now selfmanaged out of AFNIC range. Former "domaines sectoriels", still registration suffixes
avoues.fr
cci.fr
greta.fr
huissier-justice.fr

// ga : https://en.wikipedia.org/wiki/.ga
ga

// gb : This registry is effectively dormant
// Submitted by registry <Damien.Shaw@ja.net>
gb

// gd : https://en.wikipedia.org/wiki/.gd
edu.gd
gov.gd
gd

// ge : http://www.nic.net.ge/policy_en.pdf
ge
com.ge
edu.ge
gov.ge
org.ge
mil.ge
net.ge
pvt.ge

// gf : https://en.wikipedia.org/wiki/.gf
gf

// gg : http://www.channelisles.net/register-domains/
// Confirmed by registry <nigel@channelisles.net> 2013-11-28
gg
co.gg
net.gg
org.gg

// gh : https://en.wikipedia.org/wiki/.gh
// see also: http://www.nic.gh/reg_now.php
// Although domains directly at second level are not possible at the moment,
// they have been possible for some time and may come back.
gh
com.gh
edu.gh
gov.gh
org.gh
mil.gh

// gi : http://www.nic.gi/rules.html
gi
com.gi
ltd.gi
gov.gi
mod.gi
edu.gi
org.gi

// gl : https://en.wikipedia.org/wiki/.gl
// http://nic.gl
gl
co.gl
com.gl
edu.gl
net.gl
org.gl

// gm : http://www.nic.gm/htmlpages%5Cgm-policy.htm
gm

// gn : http://psg.com/dns/gn/gn.txt
// Submitted by registry <randy@psg.com>
gn
ac.gn
com.gn
edu.gn
gov.gn
org.gn
net.gn

// gov : https://en.wikipedia.org/wiki/.gov
gov

// gp : http://www.nic.gp/index.php?lang=en
gp
com.gp
net.gp
mobi.gp
edu.gp
org.gp
asso.gp

// gq : https://en.wikipedia.org/wiki/.gq
gq

// gr : https://grweb.ics.forth.gr/english/1617-B-2005.html
// Submitted by registry <segred@ics.forth.gr>
gr
com.gr
edu.gr
net.gr
org.gr
gov.gr

// gs : https://en.wikipedia.org/wiki/.gs
gs

// gt : https://www.gt/sitio/registration_policy.php?lang=en
gt
com.gt
edu.gt
gob.gt
ind.gt
mil.gt
net.gt
org.gt

// gu : http://gadao.gov.gu/register.html
// University of Guam : https://www.uog.edu
// Submitted by uognoc@triton.uog.edu
gu
com.gu
edu.gu
gov.gu
guam.gu
info.gu
net.gu
org.gu
web.gu

// gw : https://en.wikipedia.org/wiki/.gw
// gw : https://nic.gw/regras/
gw

// gy : https://en.wikipedia.org/wiki/.gy
// http://registry.gy/
gy
co.gy
com.gy
edu.gy
gov.gy
net.gy
org.gy

// hk : https://www.hkirc.hk
// Submitted by registry <hk.tech@hkirc.hk>
hk
com.hk
edu.hk
gov.hk
idv.hk
net.hk
org.hk
公司.hk
教育.hk
敎育.hk
政府.hk
個人.hk
个人.hk
箇人.hk
網络.hk
网络.hk
组織.hk
網絡.hk
网絡.hk
组织.hk
組織.hk
組织.hk

// hm : https://en.wikipedia.org/wiki/.hm
hm

// hn : http://www.nic.hn/politicas/ps02,,05.html
hn
com.hn
edu.hn
org.hn
net.hn
mil.hn
gob.hn

// hr : http://www.dns.hr/documents/pdf/HRTLD-regulations.pdf
hr
iz.hr
from.hr
name.hr
com.hr

// ht : http://www.nic.ht/info/charte.cfm
ht
com.ht
shop.ht
firm.ht
info.ht
adult.ht
net.ht
pro.ht
org.ht
med.ht
art.ht
coop.ht
pol.ht
asso.ht
edu.ht
rel.ht
gouv.ht
perso.ht

// hu : http://www.domain.hu/domain/English/sld.html
// Confirmed by registry <pasztor@iszt.hu> 2008-06-12
hu
co.hu
info.hu
org.hu
priv.hu
sport.hu
tm.hu
2000.hu
agrar.hu
bolt.hu
casino.hu
city.hu
erotica.hu
erotika.hu
film.hu
forum.hu
games.hu
hotel.hu
ingatlan.hu
jogasz.hu
konyvelo.hu
lakas.hu
media.hu
news.hu
reklam.hu
sex.hu
shop.hu
suli.hu
szex.hu
tozsde.hu
utazas.hu
video.hu

// id : https://pandi.id/en/domain/registration-requirements/
id
ac.id
biz.id
co.id
desa.id
go.id
mil.id
my.id
net.id
or.id
ponpes.id
sch.id
web.id

// ie : https://en.wikipedia.org/wiki/.ie
ie
gov.ie

// il :         http://www.isoc.org.il/domains/
// see also:    https://en.isoc.org.il/il-cctld/registration-rules
// ISOC-IL      (operated by .il Registry)
il
ac.il
co.il
gov.il
idf.il
k12.il
muni.il
net.il
org.il
// xn--4dbrk0ce ("Israel", Hebrew) : IL
ישראל
// xn--4dbgdty6c.xn--4dbrk0ce.
אקדמיה.ישראל
// xn--5dbhl8d.xn--4dbrk0ce.
ישוב.ישראל
// xn--8dbq2a.xn--4dbrk0ce.
צהל.ישראל
// xn--hebda8b.xn--4dbrk0ce.
ממשל.ישראל

// im : https://www.nic.im/
// Submitted by registry <info@nic.im>
im
ac.im
co.im
com.im
ltd.co.im
net.im
org.im
plc.co.im
tt.im
tv.im

// in : https://en.wikipedia.org/wiki/.in
// see also: https://registry.in/policies
// Please note, that nic.in is not an official eTLD, but used by most
// government institutions.
in
5g.in
6g.in
ac.in
ai.in
am.in
bihar.in
biz.in
business.in
ca.in
cn.in
co.in
com.in
coop.in
cs.in
delhi.in
dr.in
edu.in
er.in
firm.in
gen.in
gov.in
gujarat.in
ind.in
info.in
int.in
internet.in
io.in
me.in
mil.in
net.in
nic.in
org.in
pg.in
post.in
pro.in
res.in
travel.in
tv.in
uk.in
up.in
us.in

// info : https://en.wikipedia.org/wiki/.info
info

// int : https://en.wikipedia.org/wiki/.int
// Confirmed by registry <iana-questions@icann.org> 2008-06-18
int
eu.int

// io : http://www.nic.io/rules.htm
// list of other 2nd level tlds ?
io
com.io

// iq : http://www.cmc.iq/english/iq/iqregister1.htm
iq
gov.iq
edu.iq
mil.iq
com.iq
org.iq
net.iq

// ir : http://www.nic.ir/Terms_and_Conditions_ir,_Appendix_1_Domain_Rules
// Also see http://www.nic.ir/Internationalized_Domain_Names
// Two <iran>.ir entries added at request of <tech-team@nic.ir>, 2010-04-16
ir
ac.ir
co.ir
gov.ir
id.ir
net.ir
org.ir
sch.ir
// xn--mgba3a4f16a.ir (<iran>.ir, Persian YEH)
ایران.ir
// xn--mgba3a4fra.ir (<iran>.ir, Arabic YEH)
ايران.ir

// is : http://www.isnic.is/domain/rules.php
// Confirmed by registry <marius@isgate.is> 2008-12-06
is
net.is
com.is
edu.is
gov.is
org.is
int.is

// it : https://en.wikipedia.org/wiki/.it
it
gov.it
edu.it
// Reserved geo-names (regions and provinces):
// https://www.nic.it/sites/default/files/archivio/docs/Regulation_assignation_v7.1.pdf
// Regions
abr.it
abruzzo.it
aosta-valley.it
aostavalley.it
bas.it
basilicata.it
cal.it
calabria.it
cam.it
campania.it
emilia-romagna.it
emiliaromagna.it
emr.it
friuli-v-giulia.it
friuli-ve-giulia.it
friuli-vegiulia.it
friuli-venezia-giulia.it
friuli-veneziagiulia.it
friuli-vgiulia.it
friuliv-giulia.it
friulive-giulia.it
friulivegiulia.it
friulivenezia-giulia.it
friuliveneziagiulia.it
friulivgiulia.it
fvg.it
laz.it
lazio.it
lig.it
liguria.it
lom.it
lombardia.it
lombardy.it
lucania.it
mar.it
marche.it
mol.it
molise.it
piedmont.it
piemonte.it
pmn.it
pug.it
puglia.it
sar.it
sardegna.it
sardinia.it
sic.it
sicilia.it
sicily.it
taa.it
tos.it
toscana.it
trentin-sud-tirol.it
trentin-süd-tirol.it
trentin-sudtirol.it
trentin-südtirol.it
trentin-sued-tirol.it
trentin-suedtirol.it
trentino-a-adige.it
trentino-aadige.it
trentino-alto-adige.it
trentino-altoadige.it
trentino-s-tirol.it
trentino-stirol.it
trentino-sud-tirol.it
trentino-süd-tirol.it
trentino-sudtirol.it
trentino-südtirol.it
trentino-sued-tirol.it
trentino-suedtirol.it
trentino.it
trentinoa-adige.it
trentinoaadige.it
trentinoalto-adige.it
trentinoaltoadige.it
trentinos-tirol.it
trentinostirol.it
trentinosud-tirol.it
trentinosüd-tirol.it
trentinosudtirol.it
trentinosüdtirol.it
trentinosued-tirol.it
trentinosuedtirol.it
trentinsud-tirol.it
trentinsüd-tirol.it
trentinsudtirol.it
trentinsüdtirol.it
trentinsued-tirol.it
trentinsuedtirol.it
tuscany.it
umb.it
umbria.it
val-d-aosta.it
val-daosta.it
vald-aosta.it
valdaosta.it
valle-aosta.it
valle-d-aosta.it
valle-daosta.it
valleaosta.it
valled-aosta.it
valledaosta.it
vallee-aoste.it
vallée-aoste.it
vallee-d-aoste.it
vallée-d-aoste.it
valleeaoste.it
valléeaoste.it
valleedaoste.it
valléedaoste.it
vao.it
vda.it
ven.it
veneto.it
// Provinces
ag.it
agrigento.it
al.it
alessandria.it
alto-adige.it
altoadige.it
an.it
ancona.it
andria-barletta-trani.it
andria-trani-barletta.it
andriabarlettatrani.it
andriatranibarletta.it
ao.it
aosta.it
aoste.it
ap.it
aq.it
aquila.it
ar.it
arezzo.it
ascoli-piceno.it
ascolipiceno.it
asti.it
at.it
av.it
avellino.it
ba.it
balsan-sudtirol.it
balsan-südtirol.it
balsan-suedtirol.it
balsan.it
bari.it
barletta-trani-andria.it
barlettatraniandria.it
belluno.it
benevento.it
bergamo.it
bg.it
bi.it
biella.it
bl.it
bn.it
bo.it
bologna.it
bolzano-altoadige.it
bolzano.it
bozen-sudtirol.it
bozen-südtirol.it
bozen-suedtirol.it
bozen.it
br.it
brescia.it
brindisi.it
bs.it
bt.it
bulsan-sudtirol.it
bulsan-südtirol.it
bulsan-suedtirol.it
bulsan.it
bz.it
ca.it
cagliari.it
caltanissetta.it
campidano-medio.it
campidanomedio.it
campobasso.it
carbonia-iglesias.it
carboniaiglesias.it
carrara-massa.it
carraramassa.it
caserta.it
catania.it
catanzaro.it
cb.it
ce.it
cesena-forli.it
cesena-forlì.it
cesenaforli.it
cesenaforlì.it
ch.it
chieti.it
ci.it
cl.it
cn.it
co.it
como.it
cosenza.it
cr.it
cremona.it
crotone.it
cs.it
ct.it
cuneo.it
cz.it
dell-ogliastra.it
dellogliastra.it
en.it
enna.it
fc.it
fe.it
fermo.it
ferrara.it
fg.it
fi.it
firenze.it
florence.it
fm.it
foggia.it
forli-cesena.it
forlì-cesena.it
forlicesena.it
forlìcesena.it
fr.it
frosinone.it
ge.it
genoa.it
genova.it
go.it
gorizia.it
gr.it
grosseto.it
iglesias-carbonia.it
iglesiascarbonia.it
im.it
imperia.it
is.it
isernia.it
kr.it
la-spezia.it
laquila.it
laspezia.it
latina.it
lc.it
le.it
lecce.it
lecco.it
li.it
livorno.it
lo.it
lodi.it
lt.it
lu.it
lucca.it
macerata.it
mantova.it
massa-carrara.it
massacarrara.it
matera.it
mb.it
mc.it
me.it
medio-campidano.it
mediocampidano.it
messina.it
mi.it
milan.it
milano.it
mn.it
mo.it
modena.it
monza-brianza.it
monza-e-della-brianza.it
monza.it
monzabrianza.it
monzaebrianza.it
monzaedellabrianza.it
ms.it
mt.it
na.it
naples.it
napoli.it
no.it
novara.it
nu.it
nuoro.it
og.it
ogliastra.it
olbia-tempio.it
olbiatempio.it
or.it
oristano.it
ot.it
pa.it
padova.it
padua.it
palermo.it
parma.it
pavia.it
pc.it
pd.it
pe.it
perugia.it
pesaro-urbino.it
pesarourbino.it
pescara.it
pg.it
pi.it
piacenza.it
pisa.it
pistoia.it
pn.it
po.it
pordenone.it
potenza.it
pr.it
prato.it
pt.it
pu.it
pv.it
pz.it
ra.it
ragusa.it
ravenna.it
rc.it
re.it
reggio-calabria.it
reggio-emilia.it
reggiocalabria.it
reggioemilia.it
rg.it
ri.it
rieti.it
rimini.it
rm.it
rn.it
ro.it
roma.it
rome.it
rovigo.it
sa.it
salerno.it
sassari.it
savona.it
si.it
siena.it
siracusa.it
so.it
sondrio.it
sp.it
sr.it
ss.it
suedtirol.it
südtirol.it
sv.it
ta.it
taranto.it
te.it
tempio-olbia.it
tempioolbia.it
teramo.it
terni.it
tn.it
to.it
torino.it
tp.it
tr.it
trani-andria-barletta.it
trani-barletta-andria.it
traniandriabarletta.it
tranibarlettaandria.it
trapani.it
trento.it
treviso.it
trieste.it
ts.it
turin.it
tv.it
ud.it
udine.it
urbino-pesaro.it
urbinopesaro.it
va.it
varese.it
vb.it
vc.it
ve.it
venezia.it
venice.it
verbania.it
vercelli.it
verona.it
vi.it
vibo-valentia.it
vibovalentia.it
vicenza.it
viterbo.it
vr.it
vs.it
vt.it
vv.it

// je : http://www.channelisles.net/register-domains/
// Confirmed by registry <nigel@channelisles.net> 2013-11-28
je
co.je
net.je
org.je

// jm : http://www.com.jm/register.html
*.jm

// jo : http://www.dns.jo/Registration_policy.aspx
jo
com.jo
org.jo
net.jo
edu.jo
sch.jo
gov.jo
mil.jo
name.jo

// jobs : https://en.wikipedia.org/wiki/.jobs
jobs

// jp : https://en.wikipedia.org/wiki/.jp
// http://jprs.co.jp/en/jpdomain.html
// Submitted by registry <info@jprs.jp>
jp
// jp organizational type names
ac.jp
ad.jp
co.jp
ed.jp
go.jp
gr.jp
lg.jp
ne.jp
or.jp
// jp prefecture type names
aichi.jp
akita.jp
aomori.jp
chiba.jp
ehime.jp
fukui.jp
fukuoka.jp
fukushima.jp
gifu.jp
gunma.jp
hiroshima.jp
hokkaido.jp
hyogo.jp
ibaraki.jp
ishikawa.jp
iwate.jp
kagawa.jp
kagoshima.jp
kanagawa.jp
kochi.jp
kumamoto.jp
kyoto.jp
mie.jp
miyagi.jp
miyazaki.jp
nagano.jp
nagasaki.jp
nara.jp
niigata.jp
oita.jp
okayama.jp
okinawa.jp
osaka.jp
saga.jp
saitama.jp
shiga.jp
shimane.jp
shizuoka.jp
tochigi.jp
tokushima.jp
tokyo.jp
tottori.jp
toyama.jp
wakayama.jp
yamagata.jp
yamaguchi.jp
yamanashi.jp
栃木.jp
愛知.jp
愛媛.jp
兵庫.jp
熊本.jp
茨城.jp
北海道.jp
千葉.jp
和歌山.jp
長崎.jp
長野.jp
新潟.jp
青森.jp
静岡.jp
東京.jp
石川.jp
埼玉.jp
三重.jp
京都.jp
佐賀.jp
大分.jp
大阪.jp
奈良.jp
宮城.jp
宮崎.jp
富山.jp
山口.jp
山形.jp
山梨.jp
岩手.jp
岐阜.jp
岡山.jp
島根.jp
広島.jp
徳島.jp
沖縄.jp
滋賀.jp
神奈川.jp
福井.jp
福岡.jp
福島.jp
秋田.jp
群馬.jp
香川.jp
高知.jp
鳥取.jp
鹿児島.jp
// jp geographic type names
// http://jprs.jp/doc/rule/saisoku-1.html
*.kawasaki.jp
*.kitakyushu.jp
*.kobe.jp
*.nagoya.jp
*.sapporo.jp
*.sendai.jp
*.yokohama.jp
!city.kawasaki.jp
!city.kitakyushu.jp
!city.kobe.jp
!city.nagoya.jp
!city.sapporo.jp
!city.sendai.jp
!city.yokohama.jp
// 4th level registration
aisai.aichi.jp
ama.aichi.jp
anjo.aichi.jp
asuke.aichi.jp
chiryu.aichi.jp
chita.aichi.jp
fuso.aichi.jp
gamagori.aichi.jp
handa.aichi.jp
hazu.aichi.jp
hekinan.aichi.jp
higashiura.aichi.jp
ichinomiya.aichi.jp
inazawa.aichi.jp
inuyama.aichi.jp
isshiki.aichi.jp
iwakura.aichi.jp
kanie.aichi.jp
kariya.aichi.jp
kasugai.aichi.jp
kira.aichi.jp
kiyosu.aichi.jp
komaki.aichi.jp
konan.aichi.jp
kota.aichi.jp
mihama.aichi.jp
miyoshi.aichi.jp
nishio.aichi.jp
nisshin.aichi.jp
obu.aichi.jp
oguchi.aichi.jp
oharu.aichi.jp
okazaki.aichi.jp
owariasahi.aichi.jp
seto.aichi.jp
shikatsu.aichi.jp
shinshiro.aichi.jp
shitara.aichi.jp
tahara.aichi.jp
takahama.aichi.jp
tobishima.aichi.jp
toei.aichi.jp
togo.aichi.jp
tokai.aichi.jp
tokoname.aichi.jp
toyoake.aichi.jp
toyohashi.aichi.jp
toyokawa.aichi.jp
toyone.aichi.jp
toyota.aichi.jp
tsushima.aichi.jp
yatomi.aichi.jp
akita.akita.jp
daisen.akita.jp
fujisato.akita.jp
gojome.akita.jp
hachirogata.akita.jp
happou.akita.jp
higashinaruse.akita.jp
honjo.akita.jp
honjyo.akita.jp
ikawa.akita.jp
kamikoani.akita.jp
kamioka.akita.jp
katagami.akita.jp
kazuno.akita.jp
kitaakita.akita.jp
kosaka.akita.jp
kyowa.akita.jp
misato.akita.jp
mitane.akita.jp
moriyoshi.akita.jp
nikaho.akita.jp
noshiro.akita.jp
odate.akita.jp
oga.akita.jp
ogata.akita.jp
semboku.akita.jp
yokote.akita.jp
yurihonjo.akita.jp
aomori.aomori.jp
gonohe.aomori.jp
hachinohe.aomori.jp
hashikami.aomori.jp
hiranai.aomori.jp
hirosaki.aomori.jp
itayanagi.aomori.jp
kuroishi.aomori.jp
misawa.aomori.jp
mutsu.aomori.jp
nakadomari.aomori.jp
noheji.aomori.jp
oirase.aomori.jp
owani.aomori.jp
rokunohe.aomori.jp
sannohe.aomori.jp
shichinohe.aomori.jp
shingo.aomori.jp
takko.aomori.jp
towada.aomori.jp
tsugaru.aomori.jp
tsuruta.aomori.jp
abiko.chiba.jp
asahi.chiba.jp
chonan.chiba.jp
chosei.chiba.jp
choshi.chiba.jp
chuo.chiba.jp
funabashi.chiba.jp
futtsu.chiba.jp
hanamigawa.chiba.jp
ichihara.chiba.jp
ichikawa.chiba.jp
ichinomiya.chiba.jp
inzai.chiba.jp
isumi.chiba.jp
kamagaya.chiba.jp
kamogawa.chiba.jp
kashiwa.chiba.jp
katori.chiba.jp
katsuura.chiba.jp
kimitsu.chiba.jp
kisarazu.chiba.jp
kozaki.chiba.jp
kujukuri.chiba.jp
kyonan.chiba.jp
matsudo.chiba.jp
midori.chiba.jp
mihama.chiba.jp
minamiboso.chiba.jp
mobara.chiba.jp
mutsuzawa.chiba.jp
nagara.chiba.jp
nagareyama.chiba.jp
narashino.chiba.jp
narita.chiba.jp
noda.chiba.jp
oamishirasato.chiba.jp
omigawa.chiba.jp
onjuku.chiba.jp
otaki.chiba.jp
sakae.chiba.jp
sakura.chiba.jp
shimofusa.chiba.jp
shirako.chiba.jp
shiroi.chiba.jp
shisui.chiba.jp
sodegaura.chiba.jp
sosa.chiba.jp
tako.chiba.jp
tateyama.chiba.jp
togane.chiba.jp
tohnosho.chiba.jp
tomisato.chiba.jp
urayasu.chiba.jp
yachimata.chiba.jp
yachiyo.chiba.jp
yokaichiba.chiba.jp
yokoshibahikari.chiba.jp
yotsukaido.chiba.jp
ainan.ehime.jp
honai.ehime.jp
ikata.ehime.jp
imabari.ehime.jp
iyo.ehime.jp
kamijima.ehime.jp
kihoku.ehime.jp
kumakogen.ehime.jp
masaki.ehime.jp
matsuno.ehime.jp
matsuyama.ehime.jp
namikata.ehime.jp
niihama.ehime.jp
ozu.ehime.jp
saijo.ehime.jp
seiyo.ehime.jp
shikokuchuo.ehime.jp
tobe.ehime.jp
toon.ehime.jp
uchiko.ehime.jp
uwajima.ehime.jp
yawatahama.ehime.jp
echizen.fukui.jp
eiheiji.fukui.jp
fukui.fukui.jp
ikeda.fukui.jp
katsuyama.fukui.jp
mihama.fukui.jp
minamiechizen.fukui.jp
obama.fukui.jp
ohi.fukui.jp
ono.fukui.jp
sabae.fukui.jp
sakai.fukui.jp
takahama.fukui.jp
tsuruga.fukui.jp
wakasa.fukui.jp
ashiya.fukuoka.jp
buzen.fukuoka.jp
chikugo.fukuoka.jp
chikuho.fukuoka.jp
chikujo.fukuoka.jp
chikushino.fukuoka.jp
chikuzen.fukuoka.jp
chuo.fukuoka.jp
dazaifu.fukuoka.jp
fukuchi.fukuoka.jp
hakata.fukuoka.jp
higashi.fukuoka.jp
hirokawa.fukuoka.jp
hisayama.fukuoka.jp
iizuka.fukuoka.jp
inatsuki.fukuoka.jp
kaho.fukuoka.jp
kasuga.fukuoka.jp
kasuya.fukuoka.jp
kawara.fukuoka.jp
keisen.fukuoka.jp
koga.fukuoka.jp
kurate.fukuoka.jp
kurogi.fukuoka.jp
kurume.fukuoka.jp
minami.fukuoka.jp
miyako.fukuoka.jp
miyama.fukuoka.jp
miyawaka.fukuoka.jp
mizumaki.fukuoka.jp
munakata.fukuoka.jp
nakagawa.fukuoka.jp
nakama.fukuoka.jp
nishi.fukuoka.jp
nogata.fukuoka.jp
ogori.fukuoka.jp
okagaki.fukuoka.jp
okawa.fukuoka.jp
oki.fukuoka.jp
omuta.fukuoka.jp
onga.fukuoka.jp
onojo.fukuoka.jp
oto.fukuoka.jp
saigawa.fukuoka.jp
sasaguri.fukuoka.jp
shingu.fukuoka.jp
shinyoshitomi.fukuoka.jp
shonai.fukuoka.jp
soeda.fukuoka.jp
sue.fukuoka.jp
tachiarai.fukuoka.jp
tagawa.fukuoka.jp
takata.fukuoka.jp
toho.fukuoka.jp
toyotsu.fukuoka.jp
tsuiki.fukuoka.jp
ukiha.fukuoka.jp
umi.fukuoka.jp
usui.fukuoka.jp
yamada.fukuoka.jp
yame.fukuoka.jp
yanagawa.fukuoka.jp
yukuhashi.fukuoka.jp
aizubange.fukushima.jp
aizumisato.fukushima.jp
aizuwakamatsu.fukushima.jp
asakawa.fukushima.jp
bandai.fukushima.jp
date.fukushima.jp
fukushima.fukushima.jp
furudono.fukushima.jp
futaba.fukushima.jp
hanawa.fukushima.jp
higashi.fukushima.jp
hirata.fukushima.jp
hirono.fukushima.jp
iitate.fukushima.jp
inawashiro.fukushima.jp
ishikawa.fukushima.jp
iwaki.fukushima.jp
izumizaki.fukushima.jp
kagamiishi.fukushima.jp
kaneyama.fukushima.jp
kawamata.fukushima.jp
kitakata.fukushima.jp
kitashiobara.fukushima.jp
koori.fukushima.jp
koriyama.fukushima.jp
kunimi.fukushima.jp
miharu.fukushima.jp
mishima.fukushima.jp
namie.fukushima.jp
nango.fukushima.jp
nishiaizu.fukushima.jp
nishigo.fukushima.jp
okuma.fukushima.jp
omotego.fukushima.jp
ono.fukushima.jp
otama.fukushima.jp
samegawa.fukushima.jp
shimogo.fukushima.jp
shirakawa.fukushima.jp
showa.fukushima.jp
soma.fukushima.jp
sukagawa.fukushima.jp
taishin.fukushima.jp
tamakawa.fukushima.jp
tanagura.fukushima.jp
tenei.fukushima.jp
yabuki.fukushima.jp
yamato.fukushima.jp
yamatsuri.fukushima.jp
yanaizu.fukushima.jp
yugawa.fukushima.jp
anpachi.gifu.jp
ena.gifu.jp
gifu.gifu.jp
ginan.gifu.jp
godo.gifu.jp
gujo.gifu.jp
hashima.gifu.jp
hichiso.gifu.jp
hida.gifu.jp
higashishirakawa.gifu.jp
ibigawa.gifu.jp
ikeda.gifu.jp
kakamigahara.gifu.jp
kani.gifu.jp
kasahara.gifu.jp
kasamatsu.gifu.jp
kawaue.gifu.jp
kitagata.gifu.jp
mino.gifu.jp
minokamo.gifu.jp
mitake.gifu.jp
mizunami.gifu.jp
motosu.gifu.jp
nakatsugawa.gifu.jp
ogaki.gifu.jp
sakahogi.gifu.jp
seki.gifu.jp
sekigahara.gifu.jp
shirakawa.gifu.jp
tajimi.gifu.jp
takayama.gifu.jp
tarui.gifu.jp
toki.gifu.jp
tomika.gifu.jp
wanouchi.gifu.jp
yamagata.gifu.jp
yaotsu.gifu.jp
yoro.gifu.jp
annaka.gunma.jp
chiyoda.gunma.jp
fujioka.gunma.jp
higashiagatsuma.gunma.jp
isesaki.gunma.jp
itakura.gunma.jp
kanna.gunma.jp
kanra.gunma.jp
katashina.gunma.jp
kawaba.gunma.jp
kiryu.gunma.jp
kusatsu.gunma.jp
maebashi.gunma.jp
meiwa.gunma.jp
midori.gunma.jp
minakami.gunma.jp
naganohara.gunma.jp
nakanojo.gunma.jp
nanmoku.gunma.jp
numata.gunma.jp
oizumi.gunma.jp
ora.gunma.jp
ota.gunma.jp
shibukawa.gunma.jp
shimonita.gunma.jp
shinto.gunma.jp
showa.gunma.jp
takasaki.gunma.jp
takayama.gunma.jp
tamamura.gunma.jp
tatebayashi.gunma.jp
tomioka.gunma.jp
tsukiyono.gunma.jp
tsumagoi.gunma.jp
ueno.gunma.jp
yoshioka.gunma.jp
asaminami.hiroshima.jp
daiwa.hiroshima.jp
etajima.hiroshima.jp
fuchu.hiroshima.jp
fukuyama.hiroshima.jp
hatsukaichi.hiroshima.jp
higashihiroshima.hiroshima.jp
hongo.hiroshima.jp
jinsekikogen.hiroshima.jp
kaita.hiroshima.jp
kui.hiroshima.jp
kumano.hiroshima.jp
kure.hiroshima.jp
mihara.hiroshima.jp
miyoshi.hiroshima.jp
naka.hiroshima.jp
onomichi.hiroshima.jp
osakikamijima.hiroshima.jp
otake.hiroshima.jp
saka.hiroshima.jp
sera.hiroshima.jp
seranishi.hiroshima.jp
shinichi.hiroshima.jp
shobara.hiroshima.jp
takehara.hiroshima.jp
abashiri.hokkaido.jp
abira.hokkaido.jp
aibetsu.hokkaido.jp
akabira.hokkaido.jp
akkeshi.hokkaido.jp
asahikawa.hokkaido.jp
ashibetsu.hokkaido.jp
ashoro.hokkaido.jp
assabu.hokkaido.jp
atsuma.hokkaido.jp
bibai.hokkaido.jp
biei.hokkaido.jp
bifuka.hokkaido.jp
bihoro.hokkaido.jp
biratori.hokkaido.jp
chippubetsu.hokkaido.jp
chitose.hokkaido.jp
date.hokkaido.jp
ebetsu.hokkaido.jp
embetsu.hokkaido.jp
eniwa.hokkaido.jp
erimo.hokkaido.jp
esan.hokkaido.jp
esashi.hokkaido.jp
fukagawa.hokkaido.jp
fukushima.hokkaido.jp
furano.hokkaido.jp
furubira.hokkaido.jp
haboro.hokkaido.jp
hakodate.hokkaido.jp
hamatonbetsu.hokkaido.jp
hidaka.hokkaido.jp
higashikagura.hokkaido.jp
higashikawa.hokkaido.jp
hiroo.hokkaido.jp
hokuryu.hokkaido.jp
hokuto.hokkaido.jp
honbetsu.hokkaido.jp
horokanai.hokkaido.jp
horonobe.hokkaido.jp
ikeda.hokkaido.jp
imakane.hokkaido.jp
ishikari.hokkaido.jp
iwamizawa.hokkaido.jp
iwanai.hokkaido.jp
kamifurano.hokkaido.jp
kamikawa.hokkaido.jp
kamishihoro.hokkaido.jp
kamisunagawa.hokkaido.jp
kamoenai.hokkaido.jp
kayabe.hokkaido.jp
kembuchi.hokkaido.jp
kikonai.hokkaido.jp
kimobetsu.hokkaido.jp
kitahiroshima.hokkaido.jp
kitami.hokkaido.jp
kiyosato.hokkaido.jp
koshimizu.hokkaido.jp
kunneppu.hokkaido.jp
kuriyama.hokkaido.jp
kuromatsunai.hokkaido.jp
kushiro.hokkaido.jp
kutchan.hokkaido.jp
kyowa.hokkaido.jp
mashike.hokkaido.jp
matsumae.hokkaido.jp
mikasa.hokkaido.jp
minamifurano.hokkaido.jp
mombetsu.hokkaido.jp
moseushi.hokkaido.jp
mukawa.hokkaido.jp
muroran.hokkaido.jp
naie.hokkaido.jp
nakagawa.hokkaido.jp
nakasatsunai.hokkaido.jp
nakatombetsu.hokkaido.jp
nanae.hokkaido.jp
nanporo.hokkaido.jp
nayoro.hokkaido.jp
nemuro.hokkaido.jp
niikappu.hokkaido.jp
niki.hokkaido.jp
nishiokoppe.hokkaido.jp
noboribetsu.hokkaido.jp
numata.hokkaido.jp
obihiro.hokkaido.jp
obira.hokkaido.jp
oketo.hokkaido.jp
okoppe.hokkaido.jp
otaru.hokkaido.jp
otobe.hokkaido.jp
otofuke.hokkaido.jp
otoineppu.hokkaido.jp
oumu.hokkaido.jp
ozora.hokkaido.jp
pippu.hokkaido.jp
rankoshi.hokkaido.jp
rebun.hokkaido.jp
rikubetsu.hokkaido.jp
rishiri.hokkaido.jp
rishirifuji.hokkaido.jp
saroma.hokkaido.jp
sarufutsu.hokkaido.jp
shakotan.hokkaido.jp
shari.hokkaido.jp
shibecha.hokkaido.jp
shibetsu.hokkaido.jp
shikabe.hokkaido.jp
shikaoi.hokkaido.jp
shimamaki.hokkaido.jp
shimizu.hokkaido.jp
shimokawa.hokkaido.jp
shinshinotsu.hokkaido.jp
shintoku.hokkaido.jp
shiranuka.hokkaido.jp
shiraoi.hokkaido.jp
shiriuchi.hokkaido.jp
sobetsu.hokkaido.jp
sunagawa.hokkaido.jp
taiki.hokkaido.jp
takasu.hokkaido.jp
takikawa.hokkaido.jp
takinoue.hokkaido.jp
teshikaga.hokkaido.jp
tobetsu.hokkaido.jp
tohma.hokkaido.jp
tomakomai.hokkaido.jp
tomari.hokkaido.jp
toya.hokkaido.jp
toyako.hokkaido.jp
toyotomi.hokkaido.jp
toyoura.hokkaido.jp
tsubetsu.hokkaido.jp
tsukigata.hokkaido.jp
urakawa.hokkaido.jp
urausu.hokkaido.jp
uryu.hokkaido.jp
utashinai.hokkaido.jp
wakkanai.hokkaido.jp
wassamu.hokkaido.jp
yakumo.hokkaido.jp
yoichi.hokkaido.jp
aioi.hyogo.jp
akashi.hyogo.jp
ako.hyogo.jp
amagasaki.hyogo.jp
aogaki.hyogo.jp
asago.hyogo.jp
ashiya.hyogo.jp
awaji.hyogo.jp
fukusaki.hyogo.jp
goshiki.hyogo.jp
harima.hyogo.jp
himeji.hyogo.jp
ichikawa.hyogo.jp
inagawa.hyogo.jp
itami.hyogo.jp
kakogawa.hyogo.jp
kamigori.hyogo.jp
kamikawa.hyogo.jp
kasai.hyogo.jp
kasuga.hyogo.jp
kawanishi.hyogo.jp
miki.hyogo.jp
minamiawaji.hyogo.jp
nishinomiya.hyogo.jp
nishiwaki.hyogo.jp
ono.hyogo.jp
sanda.hyogo.jp
sannan.hyogo.jp
sasayama.hyogo.jp
sayo.hyogo.jp
shingu.hyogo.jp
shinonsen.hyogo.jp
shiso.hyogo.jp
sumoto.hyogo.jp
taishi.hyogo.jp
taka.hyogo.jp
takarazuka.hyogo.jp
takasago.hyogo.jp
takino.hyogo.jp
tamba.hyogo.jp
tatsuno.hyogo.jp
toyooka.hyogo.jp
yabu.hyogo.jp
yashiro.hyogo.jp
yoka.hyogo.jp
yokawa.hyogo.jp
ami.ibaraki.jp
asahi.ibaraki.jp
bando.ibaraki.jp
chikusei.ibaraki.jp
daigo.ibaraki.jp
fujishiro.ibaraki.jp
hitachi.ibaraki.jp
hitachinaka.ibaraki.jp
hitachiomiya.ibaraki.jp
hitachiota.ibaraki.jp
ibaraki.ibaraki.jp
ina.ibaraki.jp
inashiki.ibaraki.jp
itako.ibaraki.jp
iwama.ibaraki.jp
joso.ibaraki.jp
kamisu.ibaraki.jp
kasama.ibaraki.jp
kashima.ibaraki.jp
kasumigaura.ibaraki.jp
koga.ibaraki.jp
miho.ibaraki.jp
mito.ibaraki.jp
moriya.ibaraki.jp
naka.ibaraki.jp
namegata.ibaraki.jp
oarai.ibaraki.jp
ogawa.ibaraki.jp
omitama.ibaraki.jp
ryugasaki.ibaraki.jp
sakai.ibaraki.jp
sakuragawa.ibaraki.jp
shimodate.ibaraki.jp
shimotsuma.ibaraki.jp
shirosato.ibaraki.jp
sowa.ibaraki.jp
suifu.ibaraki.jp
takahagi.ibaraki.jp
tamatsukuri.ibaraki.jp
tokai.ibaraki.jp
tomobe.ibaraki.jp
tone.ibaraki.jp
toride.ibaraki.jp
tsuchiura.ibaraki.jp
tsukuba.ibaraki.jp
uchihara.ibaraki.jp
ushiku.ibaraki.jp
yachiyo.ibaraki.jp
yamagata.ibaraki.jp
yawara.ibaraki.jp
yuki.ibaraki.jp
anamizu.ishikawa.jp
hakui.ishikawa.jp
hakusan.ishikawa.jp
kaga.ishikawa.jp
kahoku.ishikawa.jp
kanazawa.ishikawa.jp
kawakita.ishikawa.jp
komatsu.ishikawa.jp
nakanoto.ishikawa.jp
nanao.ishikawa.jp
nomi.ishikawa.jp
nonoichi.ishikawa.jp
noto.ishikawa.jp
shika.ishikawa.jp
suzu.ishikawa.jp
tsubata.ishikawa.jp
tsurugi.ishikawa.jp
uchinada.ishikawa.jp
wajima.ishikawa.jp
fudai.iwate.jp
fujisawa.iwate.jp
hanamaki.iwate.jp
hiraizumi.iwate.jp
hirono.iwate.jp
ichinohe.iwate.jp
ichinoseki.iwate.jp
iwaizumi.iwate.jp
iwate.iwate.jp
joboji.iwate.jp
kamaishi.iwate.jp
kanegasaki.iwate.jp
karumai.iwate.jp
kawai.iwate.jp
kitakami.iwate.jp
kuji.iwate.jp
kunohe.iwate.jp
kuzumaki.iwate.jp
miyako.iwate.jp
mizusawa.iwate.jp
morioka.iwate.jp
ninohe.iwate.jp
noda.iwate.jp
ofunato.iwate.jp
oshu.iwate.jp
otsuchi.iwate.jp
rikuzentakata.iwate.jp
shiwa.iwate.jp
shizukuishi.iwate.jp
sumita.iwate.jp
tanohata.iwate.jp
tono.iwate.jp
yahaba.iwate.jp
yamada.iwate.jp
ayagawa.kagawa.jp
higashikagawa.kagawa.jp
kanonji.kagawa.jp
kotohira.kagawa.jp
manno.kagawa.jp
marugame.kagawa.jp
mitoyo.kagawa.jp
naoshima.kagawa.jp
sanuki.kagawa.jp
tadotsu.kagawa.jp
takamatsu.kagawa.jp
tonosho.kagawa.jp
uchinomi.kagawa.jp
utazu.kagawa.jp
zentsuji.kagawa.jp
akune.kagoshima.jp
amami.kagoshima.jp
hioki.kagoshima.jp
isa.kagoshima.jp
isen.kagoshima.jp
izumi.kagoshima.jp
kagoshima.kagoshima.jp
kanoya.kagoshima.jp
kawanabe.kagoshima.jp
kinko.kagoshima.jp
kouyama.kagoshima.jp
makurazaki.kagoshima.jp
matsumoto.kagoshima.jp
minamitane.kagoshima.jp
nakatane.kagoshima.jp
nishinoomote.kagoshima.jp
satsumasendai.kagoshima.jp
soo.kagoshima.jp
tarumizu.kagoshima.jp
yusui.kagoshima.jp
aikawa.kanagawa.jp
atsugi.kanagawa.jp
ayase.kanagawa.jp
chigasaki.kanagawa.jp
ebina.kanagawa.jp
fujisawa.kanagawa.jp
hadano.kanagawa.jp
hakone.kanagawa.jp
hiratsuka.kanagawa.jp
isehara.kanagawa.jp
kaisei.kanagawa.jp
kamakura.kanagawa.jp
kiyokawa.kanagawa.jp
matsuda.kanagawa.jp
minamiashigara.kanagawa.jp
miura.kanagawa.jp
nakai.kanagawa.jp
ninomiya.kanagawa.jp
odawara.kanagawa.jp
oi.kanagawa.jp
oiso.kanagawa.jp
sagamihara.kanagawa.jp
samukawa.kanagawa.jp
tsukui.kanagawa.jp
yamakita.kanagawa.jp
yamato.kanagawa.jp
yokosuka.kanagawa.jp
yugawara.kanagawa.jp
zama.kanagawa.jp
zushi.kanagawa.jp
aki.kochi.jp
geisei.kochi.jp
hidaka.kochi.jp
higashitsuno.kochi.jp
ino.kochi.jp
kagami.kochi.jp
kami.kochi.jp
kitagawa.kochi.jp
kochi.kochi.jp
mihara.kochi.jp
motoyama.kochi.jp
muroto.kochi.jp
nahari.kochi.jp
nakamura.kochi.jp
nankoku.kochi.jp
nishitosa.kochi.jp
niyodogawa.kochi.jp
ochi.kochi.jp
okawa.kochi.jp
otoyo.kochi.jp
otsuki.kochi.jp
sakawa.kochi.jp
sukumo.kochi.jp
susaki.kochi.jp
tosa.kochi.jp
tosashimizu.kochi.jp
toyo.kochi.jp
tsuno.kochi.jp
umaji.kochi.jp
yasuda.kochi.jp
yusuhara.kochi.jp
amakusa.kumamoto.jp
arao.kumamoto.jp
aso.kumamoto.jp
choyo.kumamoto.jp
gyokuto.kumamoto.jp
kamiamakusa.kumamoto.jp
kikuchi.kumamoto.jp
kumamoto.kumamoto.jp
mashiki.kumamoto.jp
mifune.kumamoto.jp
minamata.kumamoto.jp
minamioguni.kumamoto.jp
nagasu.kumamoto.jp
nishihara.kumamoto.jp
oguni.kumamoto.jp
ozu.kumamoto.jp
sumoto.kumamoto.jp
takamori.kumamoto.jp
uki.kumamoto.jp
uto.kumamoto.jp
yamaga.kumamoto.jp
yamato.kumamoto.jp
yatsushiro.kumamoto.jp
ayabe.kyoto.jp
fukuchiyama.kyoto.jp
higashiyama.kyoto.jp
ide.kyoto.jp
ine.kyoto.jp
joyo.kyoto.jp
kameoka.kyoto.jp
kamo.kyoto.jp
kita.kyoto.jp
kizu.kyoto.jp
kumiyama.kyoto.jp
kyotamba.kyoto.jp
kyotanabe.kyoto.jp
kyotango.kyoto.jp
maizuru.kyoto.jp
minami.kyoto.jp
minamiyamashiro.kyoto.jp
miyazu.kyoto.jp
muko.kyoto.jp
nagaokakyo.kyoto.jp
nakagyo.kyoto.jp
nantan.kyoto.jp
oyamazaki.kyoto.jp
sakyo.kyoto.jp
seika.kyoto.jp
tanabe.kyoto.jp
uji.kyoto.jp
ujitawara.kyoto.jp
wazuka.kyoto.jp
yamashina.kyoto.jp
yawata.kyoto.jp
asahi.mie.jp
inabe.mie.jp
ise.mie.jp
kameyama.mie.jp
kawagoe.mie.jp
kiho.mie.jp
kisosaki.mie.jp
kiwa.mie.jp
komono.mie.jp
kumano.mie.jp
kuwana.mie.jp
matsusaka.mie.jp
meiwa.mie.jp
mihama.mie.jp
minamiise.mie.jp
misugi.mie.jp
miyama.mie.jp
nabari.mie.jp
shima.mie.jp
suzuka.mie.jp
tado.mie.jp
taiki.mie.jp
taki.mie.jp
tamaki.mie.jp
toba.mie.jp
tsu.mie.jp
udono.mie.jp
ureshino.mie.jp
watarai.mie.jp
yokkaichi.mie.jp
furukawa.miyagi.jp
higashimatsushima.miyagi.jp
ishinomaki.miyagi.jp
iwanuma.miyagi.jp
kakuda.miyagi.jp
kami.miyagi.jp
kawasaki.miyagi.jp
marumori.miyagi.jp
matsushima.miyagi.jp
minamisanriku.miyagi.jp
misato.miyagi.jp
murata.miyagi.jp
natori.miyagi.jp
ogawara.miyagi.jp
ohira.miyagi.jp
onagawa.miyagi.jp
osaki.miyagi.jp
rifu.miyagi.jp
semine.miyagi.jp
shibata.miyagi.jp
shichikashuku.miyagi.jp
shikama.miyagi.jp
shiogama.miyagi.jp
shiroishi.miyagi.jp
tagajo.miyagi.jp
taiwa.miyagi.jp
tome.miyagi.jp
tomiya.miyagi.jp
wakuya.miyagi.jp
watari.miyagi.jp
yamamoto.miyagi.jp
zao.miyagi.jp
aya.miyazaki.jp
ebino.miyazaki.jp
gokase.miyazaki.jp
hyuga.miyazaki.jp
kadogawa.miyazaki.jp
kawaminami.miyazaki.jp
kijo.miyazaki.jp
kitagawa.miyazaki.jp
kitakata.miyazaki.jp
kitaura.miyazaki.jp
kobayashi.miyazaki.jp
kunitomi.miyazaki.jp
kushima.miyazaki.jp
mimata.miyazaki.jp
miyakonojo.miyazaki.jp
miyazaki.miyazaki.jp
morotsuka.miyazaki.jp
nichinan.miyazaki.jp
nishimera.miyazaki.jp
nobeoka.miyazaki.jp
saito.miyazaki.jp
shiiba.miyazaki.jp
shintomi.miyazaki.jp
takaharu.miyazaki.jp
takanabe.miyazaki.jp
takazaki.miyazaki.jp
tsuno.miyazaki.jp
achi.nagano.jp
agematsu.nagano.jp
anan.nagano.jp
aoki.nagano.jp
asahi.nagano.jp
azumino.nagano.jp
chikuhoku.nagano.jp
chikuma.nagano.jp
chino.nagano.jp
fujimi.nagano.jp
hakuba.nagano.jp
hara.nagano.jp
hiraya.nagano.jp
iida.nagano.jp
iijima.nagano.jp
iiyama.nagano.jp
iizuna.nagano.jp
ikeda.nagano.jp
ikusaka.nagano.jp
ina.nagano.jp
karuizawa.nagano.jp
kawakami.nagano.jp
kiso.nagano.jp
kisofukushima.nagano.jp
kitaaiki.nagano.jp
komagane.nagano.jp
komoro.nagano.jp
matsukawa.nagano.jp
matsumoto.nagano.jp
miasa.nagano.jp
minamiaiki.nagano.jp
minamimaki.nagano.jp
minamiminowa.nagano.jp
minowa.nagano.jp
miyada.nagano.jp
miyota.nagano.jp
mochizuki.nagano.jp
nagano.nagano.jp
nagawa.nagano.jp
nagiso.nagano.jp
nakagawa.nagano.jp
nakano.nagano.jp
nozawaonsen.nagano.jp
obuse.nagano.jp
ogawa.nagano.jp
okaya.nagano.jp
omachi.nagano.jp
omi.nagano.jp
ookuwa.nagano.jp
ooshika.nagano.jp
otaki.nagano.jp
otari.nagano.jp
sakae.nagano.jp
sakaki.nagano.jp
saku.nagano.jp
sakuho.nagano.jp
shimosuwa.nagano.jp
shinanomachi.nagano.jp
shiojiri.nagano.jp
suwa.nagano.jp
suzaka.nagano.jp
takagi.nagano.jp
takamori.nagano.jp
takayama.nagano.jp
tateshina.nagano.jp
tatsuno.nagano.jp
togakushi.nagano.jp
togura.nagano.jp
tomi.nagano.jp
ueda.nagano.jp
wada.nagano.jp
yamagata.nagano.jp
yamanouchi.nagano.jp
yasaka.nagano.jp
yasuoka.nagano.jp
chijiwa.nagasaki.jp
futsu.nagasaki.jp
goto.nagasaki.jp
hasami.nagasaki.jp
hirado.nagasaki.jp
iki.nagasaki.jp
isahaya.nagasaki.jp
kawatana.nagasaki.jp
kuchinotsu.nagasaki.jp
matsuura.nagasaki.jp
nagasaki.nagasaki.jp
obama.nagasaki.jp
omura.nagasaki.jp
oseto.nagasaki.jp
saikai.nagasaki.jp
sasebo.nagasaki.jp
seihi.nagasaki.jp
shimabara.nagasaki.jp
shinkamigoto.nagasaki.jp
togitsu.nagasaki.jp
tsushima.nagasaki.jp
unzen.nagasaki.jp
ando.nara.jp
gose.nara.jp
heguri.nara.jp
higashiyoshino.nara.jp
ikaruga.nara.jp
ikoma.nara.jp
kamikitayama.nara.jp
kanmaki.nara.jp
kashiba.nara.jp
kashihara.nara.jp
katsuragi.nara.jp
kawai.nara.jp
kawakami.nara.jp
kawanishi.nara.jp
koryo.nara.jp
kurotaki.nara.jp
mitsue.nara.jp
miyake.nara.jp
nara.nara.jp
nosegawa.nara.jp
oji.nara.jp
ouda.nara.jp
oyodo.nara.jp
sakurai.nara.jp
sango.nara.jp
shimoichi.nara.jp
shimokitayama.nara.jp
shinjo.nara.jp
soni.nara.jp
takatori.nara.jp
tawaramoto.nara.jp
tenkawa.nara.jp
tenri.nara.jp
uda.nara.jp
yamatokoriyama.nara.jp
yamatotakada.nara.jp
yamazoe.nara.jp
yoshino.nara.jp
aga.niigata.jp
agano.niigata.jp
gosen.niigata.jp
itoigawa.niigata.jp
izumozaki.niigata.jp
joetsu.niigata.jp
kamo.niigata.jp
kariwa.niigata.jp
kashiwazaki.niigata.jp
minamiuonuma.niigata.jp
mitsuke.niigata.jp
muika.niigata.jp
murakami.niigata.jp
myoko.niigata.jp
nagaoka.niigata.jp
niigata.niigata.jp
ojiya.niigata.jp
omi.niigata.jp
sado.niigata.jp
sanjo.niigata.jp
seiro.niigata.jp
seirou.niigata.jp
sekikawa.niigata.jp
shibata.niigata.jp
tagami.niigata.jp
tainai.niigata.jp
tochio.niigata.jp
tokamachi.niigata.jp
tsubame.niigata.jp
tsunan.niigata.jp
uonuma.niigata.jp
yahiko.niigata.jp
yoita.niigata.jp
yuzawa.niigata.jp
beppu.oita.jp
bungoono.oita.jp
bungotakada.oita.jp
hasama.oita.jp
hiji.oita.jp
himeshima.oita.jp
hita.oita.jp
kamitsue.oita.jp
kokonoe.oita.jp
kuju.oita.jp
kunisaki.oita.jp
kusu.oita.jp
oita.oita.jp
saiki.oita.jp
taketa.oita.jp
tsukumi.oita.jp
usa.oita.jp
usuki.oita.jp
yufu.oita.jp
akaiwa.okayama.jp
asakuchi.okayama.jp
bizen.okayama.jp
hayashima.okayama.jp
ibara.okayama.jp
kagamino.okayama.jp
kasaoka.okayama.jp
kibichuo.okayama.jp
kumenan.okayama.jp
kurashiki.okayama.jp
maniwa.okayama.jp
misaki.okayama.jp
nagi.okayama.jp
niimi.okayama.jp
nishiawakura.okayama.jp
okayama.okayama.jp
satosho.okayama.jp
setouchi.okayama.jp
shinjo.okayama.jp
shoo.okayama.jp
soja.okayama.jp
takahashi.okayama.jp
tamano.okayama.jp
tsuyama.okayama.jp
wake.okayama.jp
yakage.okayama.jp
aguni.okinawa.jp
ginowan.okinawa.jp
ginoza.okinawa.jp
gushikami.okinawa.jp
haebaru.okinawa.jp
higashi.okinawa.jp
hirara.okinawa.jp
iheya.okinawa.jp
ishigaki.okinawa.jp
ishikawa.okinawa.jp
itoman.okinawa.jp
izena.okinawa.jp
kadena.okinawa.jp
kin.okinawa.jp
kitadaito.okinawa.jp
kitanakagusuku.okinawa.jp
kumejima.okinawa.jp
kunigami.okinawa.jp
minamidaito.okinawa.jp
motobu.okinawa.jp
nago.okinawa.jp
naha.okinawa.jp
nakagusuku.okinawa.jp
nakijin.okinawa.jp
nanjo.okinawa.jp
nishihara.okinawa.jp
ogimi.okinawa.jp
okinawa.okinawa.jp
onna.okinawa.jp
shimoji.okinawa.jp
taketomi.okinawa.jp
tarama.okinawa.jp
tokashiki.okinawa.jp
tomigusuku.okinawa.jp
tonaki.okinawa.jp
urasoe.okinawa.jp
uruma.okinawa.jp
yaese.okinawa.jp
yomitan.okinawa.jp
yonabaru.okinawa.jp
yonaguni.okinawa.jp
zamami.okinawa.jp
abeno.osaka.jp
chihayaakasaka.osaka.jp
chuo.osaka.jp
daito.osaka.jp
fujiidera.osaka.jp
habikino.osaka.jp
hannan.osaka.jp
higashiosaka.osaka.jp
higashisumiyoshi.osaka.jp
higashiyodogawa.osaka.jp
hirakata.osaka.jp
ibaraki.osaka.jp
ikeda.osaka.jp
izumi.osaka.jp
izumiotsu.osaka.jp
izumisano.osaka.jp
kadoma.osaka.jp
kaizuka.osaka.jp
kanan.osaka.jp
kashiwara.osaka.jp
katano.osaka.jp
kawachinagano.osaka.jp
kishiwada.osaka.jp
kita.osaka.jp
kumatori.osaka.jp
matsubara.osaka.jp
minato.osaka.jp
minoh.osaka.jp
misaki.osaka.jp
moriguchi.osaka.jp
neyagawa.osaka.jp
nishi.osaka.jp
nose.osaka.jp
osakasayama.osaka.jp
sakai.osaka.jp
sayama.osaka.jp
sennan.osaka.jp
settsu.osaka.jp
shijonawate.osaka.jp
shimamoto.osaka.jp
suita.osaka.jp
tadaoka.osaka.jp
taishi.osaka.jp
tajiri.osaka.jp
takaishi.osaka.jp
takatsuki.osaka.jp
tondabayashi.osaka.jp
toyonaka.osaka.jp
toyono.osaka.jp
yao.osaka.jp
ariake.saga.jp
arita.saga.jp
fukudomi.saga.jp
genkai.saga.jp
hamatama.saga.jp
hizen.saga.jp
imari.saga.jp
kamimine.saga.jp
kanzaki.saga.jp
karatsu.saga.jp
kashima.saga.jp
kitagata.saga.jp
kitahata.saga.jp
kiyama.saga.jp
kouhoku.saga.jp
kyuragi.saga.jp
nishiarita.saga.jp
ogi.saga.jp
omachi.saga.jp
ouchi.saga.jp
saga.saga.jp
shiroishi.saga.jp
taku.saga.jp
tara.saga.jp
tosu.saga.jp
yoshinogari.saga.jp
arakawa.saitama.jp
asaka.saitama.jp
chichibu.saitama.jp
fujimi.saitama.jp
fujimino.saitama.jp
fukaya.saitama.jp
hanno.saitama.jp
hanyu.saitama.jp
hasuda.saitama.jp
hatogaya.saitama.jp
hatoyama.saitama.jp
hidaka.saitama.jp
higashichichibu.saitama.jp
higashimatsuyama.saitama.jp
honjo.saitama.jp
ina.saitama.jp
iruma.saitama.jp
iwatsuki.saitama.jp
kamiizumi.saitama.jp
kamikawa.saitama.jp
kamisato.saitama.jp
kasukabe.saitama.jp
kawagoe.saitama.jp
kawaguchi.saitama.jp
kawajima.saitama.jp
kazo.saitama.jp
kitamoto.saitama.jp
koshigaya.saitama.jp
kounosu.saitama.jp
kuki.saitama.jp
kumagaya.saitama.jp
matsubushi.saitama.jp
minano.saitama.jp
misato.saitama.jp
miyashiro.saitama.jp
miyoshi.saitama.jp
moroyama.saitama.jp
nagatoro.saitama.jp
namegawa.saitama.jp
niiza.saitama.jp
ogano.saitama.jp
ogawa.saitama.jp
ogose.saitama.jp
okegawa.saitama.jp
omiya.saitama.jp
otaki.saitama.jp
ranzan.saitama.jp
ryokami.saitama.jp
saitama.saitama.jp
sakado.saitama.jp
satte.saitama.jp
sayama.saitama.jp
shiki.saitama.jp
shiraoka.saitama.jp
soka.saitama.jp
sugito.saitama.jp
toda.saitama.jp
tokigawa.saitama.jp
tokorozawa.saitama.jp
tsurugashima.saitama.jp
urawa.saitama.jp
warabi.saitama.jp
yashio.saitama.jp
yokoze.saitama.jp
yono.saitama.jp
yorii.saitama.jp
yoshida.saitama.jp
yoshikawa.saitama.jp
yoshimi.saitama.jp
aisho.shiga.jp
gamo.shiga.jp
higashiomi.shiga.jp
hikone.shiga.jp
koka.shiga.jp
konan.shiga.jp
kosei.shiga.jp
koto.shiga.jp
kusatsu.shiga.jp
maibara.shiga.jp
moriyama.shiga.jp
nagahama.shiga.jp
nishiazai.shiga.jp
notogawa.shiga.jp
omihachiman.shiga.jp
otsu.shiga.jp
ritto.shiga.jp
ryuoh.shiga.jp
takashima.shiga.jp
takatsuki.shiga.jp
torahime.shiga.jp
toyosato.shiga.jp
yasu.shiga.jp
akagi.shimane.jp
ama.shimane.jp
gotsu.shimane.jp
hamada.shimane.jp
higashiizumo.shimane.jp
hikawa.shimane.jp
hikimi.shimane.jp
izumo.shimane.jp
kakinoki.shimane.jp
masuda.shimane.jp
matsue.shimane.jp
misato.shimane.jp
nishinoshima.shimane.jp
ohda.shimane.jp
okinoshima.shimane.jp
okuizumo.shimane.jp
shimane.shimane.jp
tamayu.shimane.jp
tsuwano.shimane.jp
unnan.shimane.jp
yakumo.shimane.jp
yasugi.shimane.jp
yatsuka.shimane.jp
arai.shizuoka.jp
atami.shizuoka.jp
fuji.shizuoka.jp
fujieda.shizuoka.jp
fujikawa.shizuoka.jp
fujinomiya.shizuoka.jp
fukuroi.shizuoka.jp
gotemba.shizuoka.jp
haibara.shizuoka.jp
hamamatsu.shizuoka.jp
higashiizu.shizuoka.jp
ito.shizuoka.jp
iwata.shizuoka.jp
izu.shizuoka.jp
izunokuni.shizuoka.jp
kakegawa.shizuoka.jp
kannami.shizuoka.jp
kawanehon.shizuoka.jp
kawazu.shizuoka.jp
kikugawa.shizuoka.jp
kosai.shizuoka.jp
makinohara.shizuoka.jp
matsuzaki.shizuoka.jp
minamiizu.shizuoka.jp
mishima.shizuoka.jp
morimachi.shizuoka.jp
nishiizu.shizuoka.jp
numazu.shizuoka.jp
omaezaki.shizuoka.jp
shimada.shizuoka.jp
shimizu.shizuoka.jp
shimoda.shizuoka.jp
shizuoka.shizuoka.jp
susono.shizuoka.jp
yaizu.shizuoka.jp
yoshida.shizuoka.jp
ashikaga.tochigi.jp
bato.tochigi.jp
haga.tochigi.jp
ichikai.tochigi.jp
iwafune.tochigi.jp
kaminokawa.tochigi.jp
kanuma.tochigi.jp
karasuyama.tochigi.jp
kuroiso.tochigi.jp
mashiko.tochigi.jp
mibu.tochigi.jp
moka.tochigi.jp
motegi.tochigi.jp
nasu.tochigi.jp
nasushiobara.tochigi.jp
nikko.tochigi.jp
nishikata.tochigi.jp
nogi.tochigi.jp
ohira.tochigi.jp
ohtawara.tochigi.jp
oyama.tochigi.jp
sakura.tochigi.jp
sano.tochigi.jp
shimotsuke.tochigi.jp
shioya.tochigi.jp
takanezawa.tochigi.jp
tochigi.tochigi.jp
tsuga.tochigi.jp
ujiie.tochigi.jp
utsunomiya.tochigi.jp
yaita.tochigi.jp
aizumi.tokushima.jp
anan.tokushima.jp
ichiba.tokushima.jp
itano.tokushima.jp
kainan.tokushima.jp
komatsushima.tokushima.jp
matsushige.tokushima.jp
mima.tokushima.jp
minami.tokushima.jp
miyoshi.tokushima.jp
mugi.tokushima.jp
nakagawa.tokushima.jp
naruto.tokushima.jp
sanagochi.tokushima.jp
shishikui.tokushima.jp
tokushima.tokushima.jp
wajiki.tokushima.jp
adachi.tokyo.jp
akiruno.tokyo.jp
akishima.tokyo.jp
aogashima.tokyo.jp
arakawa.tokyo.jp
bunkyo.tokyo.jp
chiyoda.tokyo.jp
chofu.tokyo.jp
chuo.tokyo.jp
edogawa.tokyo.jp
fuchu.tokyo.jp
fussa.tokyo.jp
hachijo.tokyo.jp
hachioji.tokyo.jp
hamura.tokyo.jp
higashikurume.tokyo.jp
higashimurayama.tokyo.jp
higashiyamato.tokyo.jp
hino.tokyo.jp
hinode.tokyo.jp
hinohara.tokyo.jp
inagi.tokyo.jp
itabashi.tokyo.jp
katsushika.tokyo.jp
kita.tokyo.jp
kiyose.tokyo.jp
kodaira.tokyo.jp
koganei.tokyo.jp
kokubunji.tokyo.jp
komae.tokyo.jp
koto.tokyo.jp
kouzushima.tokyo.jp
kunitachi.tokyo.jp
machida.tokyo.jp
meguro.tokyo.jp
minato.tokyo.jp
mitaka.tokyo.jp
mizuho.tokyo.jp
musashimurayama.tokyo.jp
musashino.tokyo.jp
nakano.tokyo.jp
nerima.tokyo.jp
ogasawara.tokyo.jp
okutama.tokyo.jp
ome.tokyo.jp
oshima.tokyo.jp
ota.tokyo.jp
setagaya.tokyo.jp
shibuya.tokyo.jp
shinagawa.tokyo.jp
shinjuku.tokyo.jp
suginami.tokyo.jp
sumida.tokyo.jp
tachikawa.tokyo.jp
taito.tokyo.jp
tama.tokyo.jp
toshima.tokyo.jp
chizu.tottori.jp
hino.tottori.jp
kawahara.tottori.jp
koge.tottori.jp
kotoura.tottori.jp
misasa.tottori.jp
nanbu.tottori.jp
nichinan.tottori.jp
sakaiminato.tottori.jp
tottori.tottori.jp
wakasa.tottori.jp
yazu.tottori.jp
yonago.tottori.jp
asahi.toyama.jp
fuchu.toyama.jp
fukumitsu.toyama.jp
funahashi.toyama.jp
himi.toyama.jp
imizu.toyama.jp
inami.toyama.jp
johana.toyama.jp
kamiichi.toyama.jp
kurobe.toyama.jp
nakaniikawa.toyama.jp
namerikawa.toyama.jp
nanto.toyama.jp
nyuzen.toyama.jp
oyabe.toyama.jp
taira.toyama.jp
takaoka.toyama.jp
tateyama.toyama.jp
toga.toyama.jp
tonami.toyama.jp
toyama.toyama.jp
unazuki.toyama.jp
uozu.toyama.jp
yamada.toyama.jp
arida.wakayama.jp
aridagawa.wakayama.jp
gobo.wakayama.jp
hashimoto.wakayama.jp
hidaka.wakayama.jp
hirogawa.wakayama.jp
inami.wakayama.jp
iwade.wakayama.jp
kainan.wakayama.jp
kamitonda.wakayama.jp
katsuragi.wakayama.jp
kimino.wakayama.jp
kinokawa.wakayama.jp
kitayama.wakayama.jp
koya.wakayama.jp
koza.wakayama.jp
kozagawa.wakayama.jp
kudoyama.wakayama.jp
kushimoto.wakayama.jp
mihama.wakayama.jp
misato.wakayama.jp
nachikatsuura.wakayama.jp
shingu.wakayama.jp
shirahama.wakayama.jp
taiji.wakayama.jp
tanabe.wakayama.jp
wakayama.wakayama.jp
yuasa.wakayama.jp
yura.wakayama.jp
asahi.yamagata.jp
funagata.yamagata.jp
higashine.yamagata.jp
iide.yamagata.jp
kahoku.yamagata.jp
kaminoyama.yamagata.jp
kaneyama.yamagata.jp
kawanishi.yamagata.jp
mamurogawa.yamagata.jp
mikawa.yamagata.jp
murayama.yamagata.jp
nagai.yamagata.jp
nakayama.yamagata.jp
nanyo.yamagata.jp
nishikawa.yamagata.jp
obanazawa.yamagata.jp
oe.yamagata.jp
oguni.yamagata.jp
ohkura.yamagata.jp
oishida.yamagata.jp
sagae.yamagata.jp
sakata.yamagata.jp
sakegawa.yamagata.jp
shinjo.yamagata.jp
shirataka.yamagata.jp
shonai.yamagata.jp
takahata.yamagata.jp
tendo.yamagata.jp
tozawa.yamagata.jp
tsuruoka.yamagata.jp
yamagata.yamagata.jp
yamanobe.yamagata.jp
yonezawa.yamagata.jp
yuza.yamagata.jp
abu.yamaguchi.jp
hagi.yamaguchi.jp
hikari.yamaguchi.jp
hofu.yamaguchi.jp
iwakuni.yamaguchi.jp
kudamatsu.yamaguchi.jp
mitou.yamaguchi.jp
nagato.yamaguchi.jp
oshima.yamaguchi.jp
shimonoseki.yamaguchi.jp
shunan.yamaguchi.jp
tabuse.yamaguchi.jp
tokuyama.yamaguchi.jp
toyota.yamaguchi.jp
ube.yamaguchi.jp
yuu.yamaguchi.jp
chuo.yamanashi.jp
doshi.yamanashi.jp
fuefuki.yamanashi.jp
fujikawa.yamanashi.jp
fujikawaguchiko.yamanashi.jp
fujiyoshida.yamanashi.jp
hayakawa.yamanashi.jp
hokuto.yamanashi.jp
ichikawamisato.yamanashi.jp
kai.yamanashi.jp
kofu.yamanashi.jp
koshu.yamanashi.jp
kosuge.yamanashi.jp
minami-alps.yamanashi.jp
minobu.yamanashi.jp
nakamichi.yamanashi.jp
nanbu.yamanashi.jp
narusawa.yamanashi.jp
nirasaki.yamanashi.jp
nishikatsura.yamanashi.jp
oshino.yamanashi.jp
otsuki.yamanashi.jp
showa.yamanashi.jp
tabayama.yamanashi.jp
tsuru.yamanashi.jp
uenohara.yamanashi.jp
yamanakako.yamanashi.jp
yamanashi.yamanashi.jp

// ke : http://www.kenic.or.ke/index.php/en/ke-domains/ke-domains
ke
ac.ke
co.ke
go.ke
info.ke
me.ke
mobi.ke
ne.ke
or.ke
sc.ke

// kg : http://www.domain.kg/dmn_n.html
kg
org.kg
net.kg
com.kg
edu.kg
gov.kg
mil.kg

// kh : http://www.mptc.gov.kh/dns_registration.htm
*.kh

// ki : http://www.ki/dns/index.html
ki
edu.ki
biz.ki
net.ki
org.ki
gov.ki
info.ki
com.ki

// km : https://en.wikipedia.org/wiki/.km
// http://www.domaine.km/documents/charte.doc
km
org.km
nom.km
gov.km
prd.km
tm.km
edu.km
mil.km
ass.km
com.km
// These are only mentioned as proposed suggestions at domaine.km, but
// https://en.wikipedia.org/wiki/.km says they're available for registration:
coop.km
asso.km
presse.km
medecin.km
notaires.km
pharmaciens.km
veterinaire.km
gouv.km

// kn : https://en.wikipedia.org/wiki/.kn
// http://www.dot.kn/domainRules.html
kn
net.kn
org.kn
edu.kn
gov.kn

// kp : http://www.kcce.kp/en_index.php
kp
com.kp
edu.kp
gov.kp
org.kp
rep.kp
tra.kp

// kr : https://en.wikipedia.org/wiki/.kr
// see also: http://domain.nida.or.kr/eng/registration.jsp
kr
ac.kr
co.kr
es.kr
go.kr
hs.kr
kg.kr
mil.kr
ms.kr
ne.kr
or.kr
pe.kr
re.kr
sc.kr
// kr geographical names
busan.kr
chungbuk.kr
chungnam.kr
daegu.kr
daejeon.kr
gangwon.kr
gwangju.kr
gyeongbuk.kr
gyeonggi.kr
gyeongnam.kr
incheon.kr
jeju.kr
jeonbuk.kr
jeonnam.kr
seoul.kr
ulsan.kr

// kw : https://www.nic.kw/policies/
// Confirmed by registry <nic.tech@citra.gov.kw>
kw
com.kw
edu.kw
emb.kw
gov.kw
ind.kw
net.kw
org.kw

// ky : http://www.icta.ky/da_ky_reg_dom.php
// Confirmed by registry <kysupport@perimeterusa.com> 2008-06-17
ky
com.ky
edu.ky
net.ky
org.ky

// kz : https://en.wikipedia.org/wiki/.kz
// see also: http://www.nic.kz/rules/index.jsp
kz
org.kz
edu.kz
net.kz
gov.kz
mil.kz
com.kz

// la : https://en.wikipedia.org/wiki/.la
// Submitted by registry <gavin.brown@nic.la>
la
int.la
net.la
info.la
edu.la
gov.la
per.la
com.la
org.la

// lb : https://en.wikipedia.org/wiki/.lb
// Submitted by registry <randy@psg.com>
lb
com.lb
edu.lb
gov.lb
net.lb
org.lb

// lc : https://en.wikipedia.org/wiki/.lc
// see also: http://www.nic.lc/rules.htm
lc
com.lc
net.lc
co.lc
org.lc
edu.lc
gov.lc

// li : https://en.wikipedia.org/wiki/.li
li

// lk : https://www.nic.lk/index.php/domain-registration/lk-domain-naming-structure
lk
gov.lk
sch.lk
net.lk
int.lk
com.lk
org.lk
edu.lk
ngo.lk
soc.lk
web.lk
ltd.lk
assn.lk
grp.lk
hotel.lk
ac.lk

// lr : http://psg.com/dns/lr/lr.txt
// Submitted by registry <randy@psg.com>
lr
com.lr
edu.lr
gov.lr
org.lr
net.lr

// ls : http://www.nic.ls/
// Confirmed by registry <lsadmin@nic.ls>
ls
ac.ls
biz.ls
co.ls
edu.ls
gov.ls
info.ls
net.ls
org.ls
sc.ls

// lt : https://en.wikipedia.org/wiki/.lt
lt
// gov.lt : http://www.gov.lt/index_en.php
gov.lt

// lu : http://www.dns.lu/en/
lu

// lv : http://www.nic.lv/DNS/En/generic.php
lv
com.lv
edu.lv
gov.lv
org.lv
mil.lv
id.lv
net.lv
asn.lv
conf.lv

// ly : http://www.nic.ly/regulations.php
ly
com.ly
net.ly
gov.ly
plc.ly
edu.ly
sch.ly
med.ly
org.ly
id.ly

// ma : https://en.wikipedia.org/wiki/.ma
// http://www.anrt.ma/fr/admin/download/upload/file_fr782.pdf
ma
co.ma
net.ma
gov.ma
org.ma
ac.ma
press.ma

// mc : http://www.nic.mc/
mc
tm.mc
asso.mc

// md : https://en.wikipedia.org/wiki/.md
md

// me : https://en.wikipedia.org/wiki/.me
me
co.me
net.me
org.me
edu.me
ac.me
gov.me
its.me
priv.me

// mg : http://nic.mg/nicmg/?page_id=39
mg
org.mg
nom.mg
gov.mg
prd.mg
tm.mg
edu.mg
mil.mg
com.mg
co.mg

// mh : https://en.wikipedia.org/wiki/.mh
mh

// mil : https://en.wikipedia.org/wiki/.mil
mil

// mk : https://en.wikipedia.org/wiki/.mk
// see also: http://dns.marnet.net.mk/postapka.php
mk
com.mk
org.mk
net.mk
edu.mk
gov.mk
inf.mk
name.mk

// ml : http://www.gobin.info/domainname/ml-template.doc
// see also: https://en.wikipedia.org/wiki/.ml
ml
com.ml
edu.ml
gouv.ml
gov.ml
net.ml
org.ml
presse.ml

// mm : https://en.wikipedia.org/wiki/.mm
*.mm

// mn : https://en.wikipedia.org/wiki/.mn
mn
gov.mn
edu.mn
org.mn

// mo : http://www.monic.net.mo/
mo
com.mo
net.mo
org.mo
edu.mo
gov.mo

// mobi : https://en.wikipedia.org/wiki/.mobi
mobi

// mp : http://www.dot.mp/
// Confirmed by registry <dcamacho@saipan.com> 2008-06-17
mp

// mq : https://en.wikipedia.org/wiki/.mq
mq

// mr : https://en.wikipedia.org/wiki/.mr
mr
gov.mr

// ms : http://www.nic.ms/pdf/MS_Domain_Name_Rules.pdf
ms
com.ms
edu.ms
gov.ms
net.ms
org.ms

// mt : https://www.nic.org.mt/go/policy
// Submitted by registry <help@nic.org.mt>
mt
com.mt
edu.mt
net.mt
org.mt

// mu : https://en.wikipedia.org/wiki/.mu
mu
com.mu
net.mu
org.mu
gov.mu
ac.mu
co.mu
or.mu

// museum : https://welcome.museum/wp-content/uploads/2018/05/20180525-Registration-Policy-MUSEUM-EN_VF-2.pdf https://welcome.museum/buy-your-dot-museum-2/
museum

// mv : https://en.wikipedia.org/wiki/.mv
// "mv" included because, contra Wikipedia, google.mv exists.
mv
aero.mv
biz.mv
com.mv
coop.mv
edu.mv
gov.mv
info.mv
int.mv
mil.mv
museum.mv
name.mv
net.mv
org.mv
pro.mv

// mw : http://www.registrar.mw/
mw
ac.mw
biz.mw
co.mw
com.mw
coop.mw
edu.mw
gov.mw
int.mw
museum.mw
net.mw
org.mw

// mx : http://www.nic.mx/
// Submitted by registry <farias@nic.mx>
mx
com.mx
org.mx
gob.mx
edu.mx
net.mx

// my : http://www.mynic.my/
// Available strings: https://mynic.my/resources/domains/buying-a-domain/
my
biz.my
com.my
edu.my
gov.my
mil.my
name.my
net.my
org.my

// mz : http://www.uem.mz/
// Submitted by registry <antonio@uem.mz>
mz
ac.mz
adv.mz
co.mz
edu.mz
gov.mz
mil.mz
net.mz
org.mz

// na : http://www.na-nic.com.na/
// http://www.info.na/domain/
na
info.na
pro.na
name.na
school.na
or.na
dr.na
us.na
mx.na
ca.na
in.na
cc.na
tv.na
ws.na
mobi.na
co.na
com.na
org.na

// name : has 2nd-level tlds, but there's no list of them
name

// nc : http://www.cctld.nc/
nc
asso.nc
nom.nc

// ne : https://en.wikipedia.org/wiki/.ne
ne

// net : https://en.wikipedia.org/wiki/.net
net

// nf : https://en.wikipedia.org/wiki/.nf
nf
com.nf
net.nf
per.nf
rec.nf
web.nf
arts.nf
firm.nf
info.nf
other.nf
store.nf

// ng : http://www.nira.org.ng/index.php/join-us/register-ng-domain/189-nira-slds
ng
com.ng
edu.ng
gov.ng
i.ng
mil.ng
mobi.ng
name.ng
net.ng
org.ng
sch.ng

// ni : http://www.nic.ni/
ni
ac.ni
biz.ni
co.ni
com.ni
edu.ni
gob.ni
in.ni
info.ni
int.ni
mil.ni
net.ni
nom.ni
org.ni
web.ni

// nl : https://en.wikipedia.org/wiki/.nl
//      https://www.sidn.nl/
//      ccTLD for the Netherlands
nl

// no : https://www.norid.no/en/om-domenenavn/regelverk-for-no/
// Norid geographical second level domains : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-b/
// Norid category second level domains : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-c/
// Norid category second-level domains managed by parties other than Norid : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-d/
// RSS feed: https://teknisk.norid.no/en/feed/
no
// Norid category second level domains : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-c/
fhs.no
vgs.no
fylkesbibl.no
folkebibl.no
museum.no
idrett.no
priv.no
// Norid category second-level domains managed by parties other than Norid : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-d/
mil.no
stat.no
dep.no
kommune.no
herad.no
// Norid geographical second level domains : https://www.norid.no/en/om-domenenavn/regelverk-for-no/vedlegg-b/
// counties
aa.no
ah.no
bu.no
fm.no
hl.no
hm.no
jan-mayen.no
mr.no
nl.no
nt.no
of.no
ol.no
oslo.no
rl.no
sf.no
st.no
svalbard.no
tm.no
tr.no
va.no
vf.no
// primary and lower secondary schools per county
gs.aa.no
gs.ah.no
gs.bu.no
gs.fm.no
gs.hl.no
gs.hm.no
gs.jan-mayen.no
gs.mr.no
gs.nl.no
gs.nt.no
gs.of.no
gs.ol.no
gs.oslo.no
gs.rl.no
gs.sf.no
gs.st.no
gs.svalbard.no
gs.tm.no
gs.tr.no
gs.va.no
gs.vf.no
// cities
akrehamn.no
åkrehamn.no
algard.no
ålgård.no
arna.no
brumunddal.no
bryne.no
bronnoysund.no
brønnøysund.no
drobak.no
drøbak.no
egersund.no
fetsund.no
floro.no
florø.no
fredrikstad.no
hokksund.no
honefoss.no
hønefoss.no
jessheim.no
jorpeland.no
jørpeland.no
kirkenes.no
kopervik.no
krokstadelva.no
langevag.no
langevåg.no
leirvik.no
mjondalen.no
mjøndalen.no
mo-i-rana.no
mosjoen.no
mosjøen.no
nesoddtangen.no
orkanger.no
osoyro.no
osøyro.no
raholt.no
råholt.no
sandnessjoen.no
sandnessjøen.no
skedsmokorset.no
slattum.no
spjelkavik.no
stathelle.no
stavern.no
stjordalshalsen.no
stjørdalshalsen.no
tananger.no
tranby.no
vossevangen.no
// communities
afjord.no
åfjord.no
agdenes.no
al.no
ål.no
alesund.no
ålesund.no
alstahaug.no
alta.no
áltá.no
alaheadju.no
álaheadju.no
alvdal.no
amli.no
åmli.no
amot.no
åmot.no
andebu.no
andoy.no
andøy.no
andasuolo.no
ardal.no
årdal.no
aremark.no
arendal.no
ås.no
aseral.no
åseral.no
asker.no
askim.no
askvoll.no
askoy.no
askøy.no
asnes.no
åsnes.no
audnedaln.no
aukra.no
aure.no
aurland.no
aurskog-holand.no
aurskog-høland.no
austevoll.no
austrheim.no
averoy.no
averøy.no
balestrand.no
ballangen.no
balat.no
bálát.no
balsfjord.no
bahccavuotna.no
báhccavuotna.no
bamble.no
bardu.no
beardu.no
beiarn.no
bajddar.no
bájddar.no
baidar.no
báidár.no
berg.no
bergen.no
berlevag.no
berlevåg.no
bearalvahki.no
bearalváhki.no
bindal.no
birkenes.no
bjarkoy.no
bjarkøy.no
bjerkreim.no
bjugn.no
bodo.no
bodø.no
badaddja.no
bådåddjå.no
budejju.no
bokn.no
bremanger.no
bronnoy.no
brønnøy.no
bygland.no
bykle.no
barum.no
bærum.no
bo.telemark.no
bø.telemark.no
bo.nordland.no
bø.nordland.no
bievat.no
bievát.no
bomlo.no
bømlo.no
batsfjord.no
båtsfjord.no
bahcavuotna.no
báhcavuotna.no
dovre.no
drammen.no
drangedal.no
dyroy.no
dyrøy.no
donna.no
dønna.no
eid.no
eidfjord.no
eidsberg.no
eidskog.no
eidsvoll.no
eigersund.no
elverum.no
enebakk.no
engerdal.no
etne.no
etnedal.no
evenes.no
evenassi.no
evenášši.no
evje-og-hornnes.no
farsund.no
fauske.no
fuossko.no
fuoisku.no
fedje.no
fet.no
finnoy.no
finnøy.no
fitjar.no
fjaler.no
fjell.no
flakstad.no
flatanger.no
flekkefjord.no
flesberg.no
flora.no
fla.no
flå.no
folldal.no
forsand.no
fosnes.no
frei.no
frogn.no
froland.no
frosta.no
frana.no
fræna.no
froya.no
frøya.no
fusa.no
fyresdal.no
forde.no
førde.no
gamvik.no
gangaviika.no
gáŋgaviika.no
gaular.no
gausdal.no
gildeskal.no
gildeskål.no
giske.no
gjemnes.no
gjerdrum.no
gjerstad.no
gjesdal.no
gjovik.no
gjøvik.no
gloppen.no
gol.no
gran.no
grane.no
granvin.no
gratangen.no
grimstad.no
grong.no
kraanghke.no
kråanghke.no
grue.no
gulen.no
hadsel.no
halden.no
halsa.no
hamar.no
hamaroy.no
habmer.no
hábmer.no
hapmir.no
hápmir.no
hammerfest.no
hammarfeasta.no
hámmárfeasta.no
haram.no
hareid.no
harstad.no
hasvik.no
aknoluokta.no
ákŋoluokta.no
hattfjelldal.no
aarborte.no
haugesund.no
hemne.no
hemnes.no
hemsedal.no
heroy.more-og-romsdal.no
herøy.møre-og-romsdal.no
heroy.nordland.no
herøy.nordland.no
hitra.no
hjartdal.no
hjelmeland.no
hobol.no
hobøl.no
hof.no
hol.no
hole.no
holmestrand.no
holtalen.no
holtålen.no
hornindal.no
horten.no
hurdal.no
hurum.no
hvaler.no
hyllestad.no
hagebostad.no
hægebostad.no
hoyanger.no
høyanger.no
hoylandet.no
høylandet.no
ha.no
hå.no
ibestad.no
inderoy.no
inderøy.no
iveland.no
jevnaker.no
jondal.no
jolster.no
jølster.no
karasjok.no
karasjohka.no
kárášjohka.no
karlsoy.no
galsa.no
gálsá.no
karmoy.no
karmøy.no
kautokeino.no
guovdageaidnu.no
klepp.no
klabu.no
klæbu.no
kongsberg.no
kongsvinger.no
kragero.no
kragerø.no
kristiansand.no
kristiansund.no
krodsherad.no
krødsherad.no
kvalsund.no
rahkkeravju.no
ráhkkerávju.no
kvam.no
kvinesdal.no
kvinnherad.no
kviteseid.no
kvitsoy.no
kvitsøy.no
kvafjord.no
kvæfjord.no
giehtavuoatna.no
kvanangen.no
kvænangen.no
navuotna.no
návuotna.no
kafjord.no
kåfjord.no
gaivuotna.no
gáivuotna.no
larvik.no
lavangen.no
lavagis.no
loabat.no
loabát.no
lebesby.no
davvesiida.no
leikanger.no
leirfjord.no
leka.no
leksvik.no
lenvik.no
leangaviika.no
leaŋgaviika.no
lesja.no
levanger.no
lier.no
lierne.no
lillehammer.no
lillesand.no
lindesnes.no
lindas.no
lindås.no
lom.no
loppa.no
lahppi.no
láhppi.no
lund.no
lunner.no
luroy.no
lurøy.no
luster.no
lyngdal.no
lyngen.no
ivgu.no
lardal.no
lerdal.no
lærdal.no
lodingen.no
lødingen.no
lorenskog.no
lørenskog.no
loten.no
løten.no
malvik.no
masoy.no
måsøy.no
muosat.no
muosát.no
mandal.no
marker.no
marnardal.no
masfjorden.no
meland.no
meldal.no
melhus.no
meloy.no
meløy.no
meraker.no
meråker.no
moareke.no
moåreke.no
midsund.no
midtre-gauldal.no
modalen.no
modum.no
molde.no
moskenes.no
moss.no
mosvik.no
malselv.no
målselv.no
malatvuopmi.no
málatvuopmi.no
namdalseid.no
aejrie.no
namsos.no
namsskogan.no
naamesjevuemie.no
nååmesjevuemie.no
laakesvuemie.no
nannestad.no
narvik.no
narviika.no
naustdal.no
nedre-eiker.no
nes.akershus.no
nes.buskerud.no
nesna.no
nesodden.no
nesseby.no
unjarga.no
unjárga.no
nesset.no
nissedal.no
nittedal.no
nord-aurdal.no
nord-fron.no
nord-odal.no
norddal.no
nordkapp.no
davvenjarga.no
davvenjárga.no
nordre-land.no
nordreisa.no
raisa.no
ráisa.no
nore-og-uvdal.no
notodden.no
naroy.no
nærøy.no
notteroy.no
nøtterøy.no
odda.no
oksnes.no
øksnes.no
oppdal.no
oppegard.no
oppegård.no
orkdal.no
orland.no
ørland.no
orskog.no
ørskog.no
orsta.no
ørsta.no
os.hedmark.no
os.hordaland.no
osen.no
osteroy.no
osterøy.no
ostre-toten.no
østre-toten.no
overhalla.no
ovre-eiker.no
øvre-eiker.no
oyer.no
øyer.no
oygarden.no
øygarden.no
oystre-slidre.no
øystre-slidre.no
porsanger.no
porsangu.no
porsáŋgu.no
porsgrunn.no
radoy.no
radøy.no
rakkestad.no
rana.no
ruovat.no
randaberg.no
rauma.no
rendalen.no
rennebu.no
rennesoy.no
rennesøy.no
rindal.no
ringebu.no
ringerike.no
ringsaker.no
rissa.no
risor.no
risør.no
roan.no
rollag.no
rygge.no
ralingen.no
rælingen.no
rodoy.no
rødøy.no
romskog.no
rømskog.no
roros.no
røros.no
rost.no
røst.no
royken.no
røyken.no
royrvik.no
røyrvik.no
rade.no
råde.no
salangen.no
siellak.no
saltdal.no
salat.no
sálát.no
sálat.no
samnanger.no
sande.more-og-romsdal.no
sande.møre-og-romsdal.no
sande.vestfold.no
sandefjord.no
sandnes.no
sandoy.no
sandøy.no
sarpsborg.no
sauda.no
sauherad.no
sel.no
selbu.no
selje.no
seljord.no
sigdal.no
siljan.no
sirdal.no
skaun.no
skedsmo.no
ski.no
skien.no
skiptvet.no
skjervoy.no
skjervøy.no
skierva.no
skiervá.no
skjak.no
skjåk.no
skodje.no
skanland.no
skånland.no
skanit.no
skánit.no
smola.no
smøla.no
snillfjord.no
snasa.no
snåsa.no
snoasa.no
snaase.no
snåase.no
sogndal.no
sokndal.no
sola.no
solund.no
songdalen.no
sortland.no
spydeberg.no
stange.no
stavanger.no
steigen.no
steinkjer.no
stjordal.no
stjørdal.no
stokke.no
stor-elvdal.no
stord.no
stordal.no
storfjord.no
omasvuotna.no
strand.no
stranda.no
stryn.no
sula.no
suldal.no
sund.no
sunndal.no
surnadal.no
sveio.no
svelvik.no
sykkylven.no
sogne.no
søgne.no
somna.no
sømna.no
sondre-land.no
søndre-land.no
sor-aurdal.no
sør-aurdal.no
sor-fron.no
sør-fron.no
sor-odal.no
sør-odal.no
sor-varanger.no
sør-varanger.no
matta-varjjat.no
mátta-várjjat.no
sorfold.no
sørfold.no
sorreisa.no
sørreisa.no
sorum.no
sørum.no
tana.no
deatnu.no
time.no
tingvoll.no
tinn.no
tjeldsund.no
dielddanuorri.no
tjome.no
tjøme.no
tokke.no
tolga.no
torsken.no
tranoy.no
tranøy.no
tromso.no
tromsø.no
tromsa.no
romsa.no
trondheim.no
troandin.no
trysil.no
trana.no
træna.no
trogstad.no
trøgstad.no
tvedestrand.no
tydal.no
tynset.no
tysfjord.no
divtasvuodna.no
divttasvuotna.no
tysnes.no
tysvar.no
tysvær.no
tonsberg.no
tønsberg.no
ullensaker.no
ullensvang.no
ulvik.no
utsira.no
vadso.no
vadsø.no
cahcesuolo.no
čáhcesuolo.no
vaksdal.no
valle.no
vang.no
vanylven.no
vardo.no
vardø.no
varggat.no
várggát.no
vefsn.no
vaapste.no
vega.no
vegarshei.no
vegårshei.no
vennesla.no
verdal.no
verran.no
vestby.no
vestnes.no
vestre-slidre.no
vestre-toten.no
vestvagoy.no
vestvågøy.no
vevelstad.no
vik.no
vikna.no
vindafjord.no
volda.no
voss.no
varoy.no
værøy.no
vagan.no
vågan.no
voagat.no
vagsoy.no
vågsøy.no
vaga.no
vågå.no
valer.ostfold.no
våler.østfold.no
valer.hedmark.no
våler.hedmark.no

// np : http://www.mos.com.np/register.html
*.np

// nr : http://cenpac.net.nr/dns/index.html
// Submitted by registry <technician@cenpac.net.nr>
nr
biz.nr
info.nr
gov.nr
edu.nr
org.nr
net.nr
com.nr

// nu : https://en.wikipedia.org/wiki/.nu
nu

// nz : https://en.wikipedia.org/wiki/.nz
// Submitted by registry <jay@nzrs.net.nz>
nz
ac.nz
co.nz
cri.nz
geek.nz
gen.nz
govt.nz
health.nz
iwi.nz
kiwi.nz
maori.nz
mil.nz
māori.nz
net.nz
org.nz
parliament.nz
school.nz

// om : https://en.wikipedia.org/wiki/.om
om
co.om
com.om
edu.om
gov.om
med.om
museum.om
net.om
org.om
pro.om

// onion : https://tools.ietf.org/html/rfc7686
onion

// org : https://en.wikipedia.org/wiki/.org
org

// pa : http://www.nic.pa/
// Some additional second level "domains" resolve directly as hostnames, such as
// pannet.pa, so we add a rule for "pa".
pa
ac.pa
gob.pa
com.pa
org.pa
sld.pa
edu.pa
net.pa
ing.pa
abo.pa
med.pa
nom.pa

// pe : https://www.nic.pe/InformeFinalComision.pdf
pe
edu.pe
gob.pe
nom.pe
mil.pe
org.pe
com.pe
net.pe

// pf : http://www.gobin.info/domainname/formulaire-pf.pdf
pf
com.pf
org.pf
edu.pf

// pg : https://en.wikipedia.org/wiki/.pg
*.pg

// ph : http://www.domains.ph/FAQ2.asp
// Submitted by registry <jed@email.com.ph>
ph
com.ph
net.ph
org.ph
gov.ph
edu.ph
ngo.ph
mil.ph
i.ph

// pk : http://pk5.pknic.net.pk/pk5/msgNamepk.PK
pk
com.pk
net.pk
edu.pk
org.pk
fam.pk
biz.pk
web.pk
gov.pk
gob.pk
gok.pk
gon.pk
gop.pk
gos.pk
info.pk

// pl http://www.dns.pl/english/index.html
// Submitted by registry
pl
com.pl
net.pl
org.pl
// pl functional domains (http://www.dns.pl/english/index.html)
aid.pl
agro.pl
atm.pl
auto.pl
biz.pl
edu.pl
gmina.pl
gsm.pl
info.pl
mail.pl
miasta.pl
media.pl
mil.pl
nieruchomosci.pl
nom.pl
pc.pl
powiat.pl
priv.pl
realestate.pl
rel.pl
sex.pl
shop.pl
sklep.pl
sos.pl
szkola.pl
targi.pl
tm.pl
tourism.pl
travel.pl
turystyka.pl
// Government domains
gov.pl
ap.gov.pl
griw.gov.pl
ic.gov.pl
is.gov.pl
kmpsp.gov.pl
konsulat.gov.pl
kppsp.gov.pl
kwp.gov.pl
kwpsp.gov.pl
mup.gov.pl
mw.gov.pl
oia.gov.pl
oirm.gov.pl
oke.gov.pl
oow.gov.pl
oschr.gov.pl
oum.gov.pl
pa.gov.pl
pinb.gov.pl
piw.gov.pl
po.gov.pl
pr.gov.pl
psp.gov.pl
psse.gov.pl
pup.gov.pl
rzgw.gov.pl
sa.gov.pl
sdn.gov.pl
sko.gov.pl
so.gov.pl
sr.gov.pl
starostwo.gov.pl
ug.gov.pl
ugim.gov.pl
um.gov.pl
umig.gov.pl
upow.gov.pl
uppo.gov.pl
us.gov.pl
uw.gov.pl
uzs.gov.pl
wif.gov.pl
wiih.gov.pl
winb.gov.pl
wios.gov.pl
witd.gov.pl
wiw.gov.pl
wkz.gov.pl
wsa.gov.pl
wskr.gov.pl
wsse.gov.pl
wuoz.gov.pl
wzmiuw.gov.pl
zp.gov.pl
zpisdn.gov.pl
// pl regional domains (http://www.dns.pl/english/index.html)
augustow.pl
babia-gora.pl
bedzin.pl
beskidy.pl
bialowieza.pl
bialystok.pl
bielawa.pl
bieszczady.pl
boleslawiec.pl
bydgoszcz.pl
bytom.pl
cieszyn.pl
czeladz.pl
czest.pl
dlugoleka.pl
elblag.pl
elk.pl
glogow.pl
gniezno.pl
gorlice.pl
grajewo.pl
ilawa.pl
jaworzno.pl
jelenia-gora.pl
jgora.pl
kalisz.pl
kazimierz-dolny.pl
karpacz.pl
kartuzy.pl
kaszuby.pl
katowice.pl
kepno.pl
ketrzyn.pl
klodzko.pl
kobierzyce.pl
kolobrzeg.pl
konin.pl
konskowola.pl
kutno.pl
lapy.pl
lebork.pl
legnica.pl
lezajsk.pl
limanowa.pl
lomza.pl
lowicz.pl
lubin.pl
lukow.pl
malbork.pl
malopolska.pl
mazowsze.pl
mazury.pl
mielec.pl
mielno.pl
mragowo.pl
naklo.pl
nowaruda.pl
nysa.pl
olawa.pl
olecko.pl
olkusz.pl
olsztyn.pl
opoczno.pl
opole.pl
ostroda.pl
ostroleka.pl
ostrowiec.pl
ostrowwlkp.pl
pila.pl
pisz.pl
podhale.pl
podlasie.pl
polkowice.pl
pomorze.pl
pomorskie.pl
prochowice.pl
pruszkow.pl
przeworsk.pl
pulawy.pl
radom.pl
rawa-maz.pl
rybnik.pl
rzeszow.pl
sanok.pl
sejny.pl
slask.pl
slupsk.pl
sosnowiec.pl
stalowa-wola.pl
skoczow.pl
starachowice.pl
stargard.pl
suwalki.pl
swidnica.pl
swiebodzin.pl
swinoujscie.pl
szczecin.pl
szczytno.pl
tarnobrzeg.pl
tgory.pl
turek.pl
tychy.pl
ustka.pl
walbrzych.pl
warmia.pl
warszawa.pl
waw.pl
wegrow.pl
wielun.pl
wlocl.pl
wloclawek.pl
wodzislaw.pl
wolomin.pl
wroclaw.pl
zachpomor.pl
zagan.pl
zarow.pl
zgora.pl
zgorzelec.pl

// pm : https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
pm

// pn : http://www.government.pn/PnRegistry/policies.htm
pn
gov.pn
co.pn
org.pn
edu.pn
net.pn

// post : https://en.wikipedia.org/wiki/.post
post

// pr : http://www.nic.pr/index.asp?f=1
pr
com.pr
net.pr
org.pr
gov.pr
edu.pr
isla.pr
pro.pr
biz.pr
info.pr
name.pr
// these aren't mentioned on nic.pr, but on https://en.wikipedia.org/wiki/.pr
est.pr
prof.pr
ac.pr

// pro : http://registry.pro/get-pro
pro
aaa.pro
aca.pro
acct.pro
avocat.pro
bar.pro
cpa.pro
eng.pro
jur.pro
law.pro
med.pro
recht.pro

// ps : https://en.wikipedia.org/wiki/.ps
// http://www.nic.ps/registration/policy.html#reg
ps
edu.ps
gov.ps
sec.ps
plo.ps
com.ps
org.ps
net.ps

// pt : https://www.dns.pt/en/domain/pt-terms-and-conditions-registration-rules/
pt
net.pt
gov.pt
org.pt
edu.pt
int.pt
publ.pt
com.pt
nome.pt

// pw : https://en.wikipedia.org/wiki/.pw
pw
co.pw
ne.pw
or.pw
ed.pw
go.pw
belau.pw

// py : http://www.nic.py/pautas.html#seccion_9
// Submitted by registry
py
com.py
coop.py
edu.py
gov.py
mil.py
net.py
org.py

// qa : http://domains.qa/en/
qa
com.qa
edu.qa
gov.qa
mil.qa
name.qa
net.qa
org.qa
sch.qa

// re : https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
re
asso.re
com.re
nom.re

// ro : http://www.rotld.ro/
ro
arts.ro
com.ro
firm.ro
info.ro
nom.ro
nt.ro
org.ro
rec.ro
store.ro
tm.ro
www.ro

// rs : https://www.rnids.rs/en/domains/national-domains
rs
ac.rs
co.rs
edu.rs
gov.rs
in.rs
org.rs

// ru : https://cctld.ru/files/pdf/docs/en/rules_ru-rf.pdf
// Submitted by George Georgievsky <gug@cctld.ru>
ru

// rw : https://www.ricta.org.rw/sites/default/files/resources/registry_registrar_contract_0.pdf
rw
ac.rw
co.rw
coop.rw
gov.rw
mil.rw
net.rw
org.rw

// sa : http://www.nic.net.sa/
sa
com.sa
net.sa
org.sa
gov.sa
med.sa
pub.sa
edu.sa
sch.sa

// sb : http://www.sbnic.net.sb/
// Submitted by registry <lee.humphries@telekom.com.sb>
sb
com.sb
edu.sb
gov.sb
net.sb
org.sb

// sc : http://www.nic.sc/
sc
com.sc
gov.sc
net.sc
org.sc
edu.sc

// sd : http://www.isoc.sd/sudanic.isoc.sd/billing_pricing.htm
// Submitted by registry <admin@isoc.sd>
sd
com.sd
net.sd
org.sd
edu.sd
med.sd
tv.sd
gov.sd
info.sd

// se : https://en.wikipedia.org/wiki/.se
// Submitted by registry <patrik.wallstrom@iis.se>
se
a.se
ac.se
b.se
bd.se
brand.se
c.se
d.se
e.se
f.se
fh.se
fhsk.se
fhv.se
g.se
h.se
i.se
k.se
komforb.se
kommunalforbund.se
komvux.se
l.se
lanbib.se
m.se
n.se
naturbruksgymn.se
o.se
org.se
p.se
parti.se
pp.se
press.se
r.se
s.se
t.se
tm.se
u.se
w.se
x.se
y.se
z.se

// sg : http://www.nic.net.sg/page/registration-policies-procedures-and-guidelines
sg
com.sg
net.sg
org.sg
gov.sg
edu.sg
per.sg

// sh : http://nic.sh/rules.htm
sh
com.sh
net.sh
gov.sh
org.sh
mil.sh

// si : https://en.wikipedia.org/wiki/.si
si

// sj : No registrations at this time.
// Submitted by registry <jarle@uninett.no>
sj

// sk : https://en.wikipedia.org/wiki/.sk
// list of 2nd level domains ?
sk

// sl : http://www.nic.sl
// Submitted by registry <adam@neoip.com>
sl
com.sl
net.sl
edu.sl
gov.sl
org.sl

// sm : https://en.wikipedia.org/wiki/.sm
sm

// sn : https://en.wikipedia.org/wiki/.sn
sn
art.sn
com.sn
edu.sn
gouv.sn
org.sn
perso.sn
univ.sn

// so : http://sonic.so/policies/
so
com.so
edu.so
gov.so
me.so
net.so
org.so

// sr : https://en.wikipedia.org/wiki/.sr
sr

// ss : https://registry.nic.ss/
// Submitted by registry <technical@nic.ss>
ss
biz.ss
com.ss
edu.ss
gov.ss
me.ss
net.ss
org.ss
sch.ss

// st : http://www.nic.st/html/policyrules/
st
co.st
com.st
consulado.st
edu.st
embaixada.st
mil.st
net.st
org.st
principe.st
saotome.st
store.st

// su : https://en.wikipedia.org/wiki/.su
su

// sv : http://www.svnet.org.sv/niveldos.pdf
sv
com.sv
edu.sv
gob.sv
org.sv
red.sv

// sx : https://en.wikipedia.org/wiki/.sx
// Submitted by registry <jcvignes@openregistry.com>
sx
gov.sx

// sy : https://en.wikipedia.org/wiki/.sy
// see also: http://www.gobin.info/domainname/sy.doc
sy
edu.sy
gov.sy
net.sy
mil.sy
com.sy
org.sy

// sz : https://en.wikipedia.org/wiki/.sz
// http://www.sispa.org.sz/
sz
co.sz
ac.sz
org.sz

// tc : https://en.wikipedia.org/wiki/.tc
tc

// td : https://en.wikipedia.org/wiki/.td
td

// tel: https://en.wikipedia.org/wiki/.tel
// http://www.telnic.org/
tel

// tf : https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
tf

// tg : https://en.wikipedia.org/wiki/.tg
// http://www.nic.tg/
tg

// th : https://en.wikipedia.org/wiki/.th
// Submitted by registry <krit@thains.co.th>
th
ac.th
co.th
go.th
in.th
mi.th
net.th
or.th

// tj : http://www.nic.tj/policy.html
tj
ac.tj
biz.tj
co.tj
com.tj
edu.tj
go.tj
gov.tj
int.tj
mil.tj
name.tj
net.tj
nic.tj
org.tj
test.tj
web.tj

// tk : https://en.wikipedia.org/wiki/.tk
tk

// tl : https://en.wikipedia.org/wiki/.tl
tl
gov.tl

// tm : http://www.nic.tm/local.html
tm
com.tm
co.tm
org.tm
net.tm
nom.tm
gov.tm
mil.tm
edu.tm

// tn : http://www.registre.tn/fr/
// https://whois.ati.tn/
tn
com.tn
ens.tn
fin.tn
gov.tn
ind.tn
info.tn
intl.tn
mincom.tn
nat.tn
net.tn
org.tn
perso.tn
tourism.tn

// to : https://en.wikipedia.org/wiki/.to
// Submitted by registry <egullich@colo.to>
to
com.to
gov.to
net.to
org.to
edu.to
mil.to

// tr : https://nic.tr/
// https://nic.tr/forms/eng/policies.pdf
// https://nic.tr/index.php?USRACTN=PRICELST
tr
av.tr
bbs.tr
bel.tr
biz.tr
com.tr
dr.tr
edu.tr
gen.tr
gov.tr
info.tr
mil.tr
k12.tr
kep.tr
name.tr
net.tr
org.tr
pol.tr
tel.tr
tsk.tr
tv.tr
web.tr
// Used by Northern Cyprus
nc.tr
// Used by government agencies of Northern Cyprus
gov.nc.tr

// tt : http://www.nic.tt/
tt
co.tt
com.tt
org.tt
net.tt
biz.tt
info.tt
pro.tt
int.tt
coop.tt
jobs.tt
mobi.tt
travel.tt
museum.tt
aero.tt
name.tt
gov.tt
edu.tt

// tv : https://en.wikipedia.org/wiki/.tv
// Not listing any 2LDs as reserved since none seem to exist in practice,
// Wikipedia notwithstanding.
tv

// tw : https://en.wikipedia.org/wiki/.tw
tw
edu.tw
gov.tw
mil.tw
com.tw
net.tw
org.tw
idv.tw
game.tw
ebiz.tw
club.tw
網路.tw
組織.tw
商業.tw

// tz : http://www.tznic.or.tz/index.php/domains
// Submitted by registry <manager@tznic.or.tz>
tz
ac.tz
co.tz
go.tz
hotel.tz
info.tz
me.tz
mil.tz
mobi.tz
ne.tz
or.tz
sc.tz
tv.tz

// ua : https://hostmaster.ua/policy/?ua
// Submitted by registry <dk@cctld.ua>
ua
// ua 2LD
com.ua
edu.ua
gov.ua
in.ua
net.ua
org.ua
// ua geographic names
// https://hostmaster.ua/2ld/
cherkassy.ua
cherkasy.ua
chernigov.ua
chernihiv.ua
chernivtsi.ua
chernovtsy.ua
ck.ua
cn.ua
cr.ua
crimea.ua
cv.ua
dn.ua
dnepropetrovsk.ua
dnipropetrovsk.ua
donetsk.ua
dp.ua
if.ua
ivano-frankivsk.ua
kh.ua
kharkiv.ua
kharkov.ua
kherson.ua
khmelnitskiy.ua
khmelnytskyi.ua
kiev.ua
kirovograd.ua
km.ua
kr.ua
kropyvnytskyi.ua
krym.ua
ks.ua
kv.ua
kyiv.ua
lg.ua
lt.ua
lugansk.ua
luhansk.ua
lutsk.ua
lv.ua
lviv.ua
mk.ua
mykolaiv.ua
nikolaev.ua
od.ua
odesa.ua
odessa.ua
pl.ua
poltava.ua
rivne.ua
rovno.ua
rv.ua
sb.ua
sebastopol.ua
sevastopol.ua
sm.ua
sumy.ua
te.ua
ternopil.ua
uz.ua
uzhgorod.ua
uzhhorod.ua
vinnica.ua
vinnytsia.ua
vn.ua
volyn.ua
yalta.ua
zakarpattia.ua
zaporizhzhe.ua
zaporizhzhia.ua
zhitomir.ua
zhytomyr.ua
zp.ua
zt.ua

// ug : https://www.registry.co.ug/
ug
co.ug
or.ug
ac.ug
sc.ug
go.ug
ne.ug
com.ug
org.ug

// uk : https://en.wikipedia.org/wiki/.uk
// Submitted by registry <Michael.Daly@nominet.org.uk>
uk
ac.uk
co.uk
gov.uk
ltd.uk
me.uk
net.uk
nhs.uk
org.uk
plc.uk
police.uk
*.sch.uk

// us : https://en.wikipedia.org/wiki/.us
us
dni.us
fed.us
isa.us
kids.us
nsn.us
// us geographic names
ak.us
al.us
ar.us
as.us
az.us
ca.us
co.us
ct.us
dc.us
de.us
fl.us
ga.us
gu.us
hi.us
ia.us
id.us
il.us
in.us
ks.us
ky.us
la.us
ma.us
md.us
me.us
mi.us
mn.us
mo.us
ms.us
mt.us
nc.us
nd.us
ne.us
nh.us
nj.us
nm.us
nv.us
ny.us
oh.us
ok.us
or.us
pa.us
pr.us
ri.us
sc.us
sd.us
tn.us
tx.us
ut.us
vi.us
vt.us
va.us
wa.us
wi.us
wv.us
wy.us
// The registrar notes several more specific domains available in each state,
// such as state.*.us, dst.*.us, etc., but resolution of these is somewhat
// haphazard; in some states these domains resolve as addresses, while in others
// only subdomains are available, or even nothing at all. We include the
// most common ones where it's clear that different sites are different
// entities.
k12.ak.us
k12.al.us
k12.ar.us
k12.as.us
k12.az.us
k12.ca.us
k12.co.us
k12.ct.us
k12.dc.us
k12.fl.us
k12.ga.us
k12.gu.us
// k12.hi.us  Bug 614565 - Hawaii has a state-wide DOE login
k12.ia.us
k12.id.us
k12.il.us
k12.in.us
k12.ks.us
k12.ky.us
k12.la.us
k12.ma.us
k12.md.us
k12.me.us
k12.mi.us
k12.mn.us
k12.mo.us
k12.ms.us
k12.mt.us
k12.nc.us
// k12.nd.us  Bug 1028347 - Removed at request of Travis Rosso <trossow@nd.gov>
k12.ne.us
k12.nh.us
k12.nj.us
k12.nm.us
k12.nv.us
k12.ny.us
k12.oh.us
k12.ok.us
k12.or.us
k12.pa.us
k12.pr.us
// k12.ri.us  Removed at request of Kim Cournoyer <netsupport@staff.ri.net>
k12.sc.us
// k12.sd.us  Bug 934131 - Removed at request of James Booze <James.Booze@k12.sd.us>
k12.tn.us
k12.tx.us
k12.ut.us
k12.vi.us
k12.vt.us
k12.va.us
k12.wa.us
k12.wi.us
// k12.wv.us  Bug 947705 - Removed at request of Verne Britton <verne@wvnet.edu>
k12.wy.us
cc.ak.us
cc.al.us
cc.ar.us
cc.as.us
cc.az.us
cc.ca.us
cc.co.us
cc.ct.us
cc.dc.us
cc.de.us
cc.fl.us
cc.ga.us
cc.gu.us
cc.hi.us
cc.ia.us
cc.id.us
cc.il.us
cc.in.us
cc.ks.us
cc.ky.us
cc.la.us
cc.ma.us
cc.md.us
cc.me.us
cc.mi.us
cc.mn.us
cc.mo.us
cc.ms.us
cc.mt.us
cc.nc.us
cc.nd.us
cc.ne.us
cc.nh.us
cc.nj.us
cc.nm.us
cc.nv.us
cc.ny.us
cc.oh.us
cc.ok.us
cc.or.us
cc.pa.us
cc.pr.us
cc.ri.us
cc.sc.us
cc.sd.us
cc.tn.us
cc.tx.us
cc.ut.us
cc.vi.us
cc.vt.us
cc.va.us
cc.wa.us
cc.wi.us
cc.wv.us
cc.wy.us
lib.ak.us
lib.al.us
lib.ar.us
lib.as.us
lib.az.us
lib.ca.us
lib.co.us
lib.ct.us
lib.dc.us
// lib.de.us  Issue #243 - Moved to Private section at request of Ed Moore <Ed.Moore@lib.de.us>
lib.fl.us
lib.ga.us
lib.gu.us
lib.hi.us
lib.ia.us
lib.id.us
lib.il.us
lib.in.us
lib.ks.us
lib.ky.us
lib.la.us
lib.ma.us
lib.md.us
lib.me.us
lib.mi.us
lib.mn.us
lib.mo.us
lib.ms.us
lib.mt.us
lib.nc.us
lib.nd.us
lib.ne.us
lib.nh.us
lib.nj.us
lib.nm.us
lib.nv.us
lib.ny.us
lib.oh.us
lib.ok.us
lib.or.us
lib.pa.us
lib.pr.us
lib.ri.us
lib.sc.us
lib.sd.us
lib.tn.us
lib.tx.us
lib.ut.us
lib.vi.us
lib.vt.us
lib.va.us
lib.wa.us
lib.wi.us
// lib.wv.us  Bug 941670 - Removed at request of Larry W Arnold <arnold@wvlc.lib.wv.us>
lib.wy.us
// k12.ma.us contains school districts in Massachusetts. The 4LDs are
//  managed independently except for private (PVT), charter (CHTR) and
//  parochial (PAROCH) schools.  Those are delegated directly to the
//  5LD operators.   <k12-ma-hostmaster _ at _ rsuc.gweep.net>
pvt.k12.ma.us
chtr.k12.ma.us
paroch.k12.ma.us
// Merit Network, Inc. maintains the registry for =~ /(k12|cc|lib).mi.us/ and the following
//    see also: http://domreg.merit.edu
//    see also: whois -h whois.domreg.merit.edu help
ann-arbor.mi.us
cog.mi.us
dst.mi.us
eaton.mi.us
gen.mi.us
mus.mi.us
tec.mi.us
washtenaw.mi.us

// uy : http://www.nic.org.uy/
uy
com.uy
edu.uy
gub.uy
mil.uy
net.uy
org.uy

// uz : http://www.reg.uz/
uz
co.uz
com.uz
net.uz
org.uz

// va : https://en.wikipedia.org/wiki/.va
va

// vc : https://en.wikipedia.org/wiki/.vc
// Submitted by registry <kshah@ca.afilias.info>
vc
com.vc
net.vc
org.vc
gov.vc
mil.vc
edu.vc

// ve : https://registro.nic.ve/
// Submitted by registry nic@nic.ve and nicve@conatel.gob.ve
ve
arts.ve
bib.ve
co.ve
com.ve
e12.ve
edu.ve
firm.ve
gob.ve
gov.ve
info.ve
int.ve
mil.ve
net.ve
nom.ve
org.ve
rar.ve
rec.ve
store.ve
tec.ve
web.ve

// vg : https://en.wikipedia.org/wiki/.vg
vg

// vi : http://www.nic.vi/newdomainform.htm
// http://www.nic.vi/Domain_Rules/body_domain_rules.html indicates some other
// TLDs are "reserved", such as edu.vi and gov.vi, but doesn't actually say they
// are available for registration (which they do not seem to be).
vi
co.vi
com.vi
k12.vi
net.vi
org.vi

// vn : https://www.vnnic.vn/en/domain/cctld-vn
// https://vnnic.vn/sites/default/files/tailieu/vn.cctld.domains.txt
vn
ac.vn
ai.vn
biz.vn
com.vn
edu.vn
gov.vn
health.vn
id.vn
info.vn
int.vn
io.vn
name.vn
net.vn
org.vn
pro.vn

// vn geographical names
angiang.vn
bacgiang.vn
backan.vn
baclieu.vn
bacninh.vn
baria-vungtau.vn
bentre.vn
binhdinh.vn
binhduong.vn
binhphuoc.vn
binhthuan.vn
camau.vn
cantho.vn
caobang.vn
daklak.vn
daknong.vn
danang.vn
dienbien.vn
dongnai.vn
dongthap.vn
gialai.vn
hagiang.vn
haiduong.vn
haiphong.vn
hanam.vn
hanoi.vn
hatinh.vn
haugiang.vn
hoabinh.vn
hungyen.vn
khanhhoa.vn
kiengiang.vn
kontum.vn
laichau.vn
lamdong.vn
langson.vn
laocai.vn
longan.vn
namdinh.vn
nghean.vn
ninhbinh.vn
ninhthuan.vn
phutho.vn
phuyen.vn
quangbinh.vn
quangnam.vn
quangngai.vn
quangninh.vn
quangtri.vn
soctrang.vn
sonla.vn
tayninh.vn
thaibinh.vn
thainguyen.vn
thanhhoa.vn
thanhphohochiminh.vn
thuathienhue.vn
tiengiang.vn
travinh.vn
tuyenquang.vn
vinhlong.vn
vinhphuc.vn
yenbai.vn

// vu : https://en.wikipedia.org/wiki/.vu
// http://www.vunic.vu/
vu
com.vu
edu.vu
net.vu
org.vu

// wf : https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
wf

// ws : https://en.wikipedia.org/wiki/.ws
// http://samoanic.ws/index.dhtml
ws
com.ws
net.ws
org.ws
gov.ws
edu.ws

// yt : https://www.afnic.fr/wp-media/uploads/2022/12/afnic-naming-policy-2023-01-01.pdf
yt

// IDN ccTLDs
// When submitting patches, please maintain a sort by ISO 3166 ccTLD, then
// U-label, and follow this format:
// // A-Label ("<Latin renderings>", <language name>[, variant info]) : <ISO 3166 ccTLD>
// // [sponsoring org]
// U-Label

// xn--mgbaam7a8h ("Emerat", Arabic) : AE
// http://nic.ae/english/arabicdomain/rules.jsp
امارات

// xn--y9a3aq ("hye", Armenian) : AM
// ISOC AM (operated by .am Registry)
հայ

// xn--54b7fta0cc ("Bangla", Bangla) : BD
বাংলা

// xn--90ae ("bg", Bulgarian) : BG
бг

// xn--mgbcpq6gpa1a ("albahrain", Arabic) : BH
البحرين

// xn--90ais ("bel", Belarusian/Russian Cyrillic) : BY
// Operated by .by registry
бел

// xn--fiqs8s ("Zhongguo/China", Chinese, Simplified) : CN
// CNNIC
// http://cnnic.cn/html/Dir/2005/10/11/3218.htm
中国

// xn--fiqz9s ("Zhongguo/China", Chinese, Traditional) : CN
// CNNIC
// http://cnnic.cn/html/Dir/2005/10/11/3218.htm
中國

// xn--lgbbat1ad8j ("Algeria/Al Jazair", Arabic) : DZ
الجزائر

// xn--wgbh1c ("Egypt/Masr", Arabic) : EG
// http://www.dotmasr.eg/
مصر

// xn--e1a4c ("eu", Cyrillic) : EU
// https://eurid.eu
ею

// xn--qxa6a ("eu", Greek) : EU
// https://eurid.eu
ευ

// xn--mgbah1a3hjkrd ("Mauritania", Arabic) : MR
موريتانيا

// xn--node ("ge", Georgian Mkhedruli) : GE
გე

// xn--qxam ("el", Greek) : GR
// Hellenic Ministry of Infrastructure, Transport, and Networks
ελ

// xn--j6w193g ("Hong Kong", Chinese) : HK
// https://www.hkirc.hk
// Submitted by registry <hk.tech@hkirc.hk>
// https://www.hkirc.hk/content.jsp?id=30#!/34
香港
公司.香港
教育.香港
政府.香港
個人.香港
網絡.香港
組織.香港

// xn--2scrj9c ("Bharat", Kannada) : IN
// India
ಭಾರತ

// xn--3hcrj9c ("Bharat", Oriya) : IN
// India
ଭାରତ

// xn--45br5cyl ("Bharatam", Assamese) : IN
// India
ভাৰত

// xn--h2breg3eve ("Bharatam", Sanskrit) : IN
// India
भारतम्

// xn--h2brj9c8c ("Bharot", Santali) : IN
// India
भारोत

// xn--mgbgu82a ("Bharat", Sindhi) : IN
// India
ڀارت

// xn--rvc1e0am3e ("Bharatam", Malayalam) : IN
// India
ഭാരതം

// xn--h2brj9c ("Bharat", Devanagari) : IN
// India
भारत

// xn--mgbbh1a ("Bharat", Kashmiri) : IN
// India
بارت

// xn--mgbbh1a71e ("Bharat", Arabic) : IN
// India
بھارت

// xn--fpcrj9c3d ("Bharat", Telugu) : IN
// India
భారత్

// xn--gecrj9c ("Bharat", Gujarati) : IN
// India
ભારત

// xn--s9brj9c ("Bharat", Gurmukhi) : IN
// India
ਭਾਰਤ

// xn--45brj9c ("Bharat", Bengali) : IN
// India
ভারত

// xn--xkc2dl3a5ee0h ("India", Tamil) : IN
// India
இந்தியா

// xn--mgba3a4f16a ("Iran", Persian) : IR
ایران

// xn--mgba3a4fra ("Iran", Arabic) : IR
ايران

// xn--mgbtx2b ("Iraq", Arabic) : IQ
// Communications and Media Commission
عراق

// xn--mgbayh7gpa ("al-Ordon", Arabic) : JO
// National Information Technology Center (NITC)
// Royal Scientific Society, Al-Jubeiha
الاردن

// xn--3e0b707e ("Republic of Korea", Hangul) : KR
한국

// xn--80ao21a ("Kaz", Kazakh) : KZ
қаз

// xn--q7ce6a ("Lao", Lao) : LA
ລາວ

// xn--fzc2c9e2c ("Lanka", Sinhalese-Sinhala) : LK
// https://nic.lk
ලංකා

// xn--xkc2al3hye2a ("Ilangai", Tamil) : LK
// https://nic.lk
இலங்கை

// xn--mgbc0a9azcg ("Morocco/al-Maghrib", Arabic) : MA
المغرب

// xn--d1alf ("mkd", Macedonian) : MK
// MARnet
мкд

// xn--l1acc ("mon", Mongolian) : MN
мон

// xn--mix891f ("Macao", Chinese, Traditional) : MO
// MONIC / HNET Asia (Registry Operator for .mo)
澳門

// xn--mix082f ("Macao", Chinese, Simplified) : MO
澳门

// xn--mgbx4cd0ab ("Malaysia", Malay) : MY
مليسيا

// xn--mgb9awbf ("Oman", Arabic) : OM
عمان

// xn--mgbai9azgqp6j ("Pakistan", Urdu/Arabic) : PK
پاکستان

// xn--mgbai9a5eva00b ("Pakistan", Urdu/Arabic, variant) : PK
پاكستان

// xn--ygbi2ammx ("Falasteen", Arabic) : PS
// The Palestinian National Internet Naming Authority (PNINA)
// http://www.pnina.ps
فلسطين

// xn--90a3ac ("srb", Cyrillic) : RS
// https://www.rnids.rs/en/domains/national-domains
срб
пр.срб
орг.срб
обр.срб
од.срб
упр.срб
ак.срб

// xn--p1ai ("rf", Russian-Cyrillic) : RU
// https://cctld.ru/files/pdf/docs/en/rules_ru-rf.pdf
// Submitted by George Georgievsky <gug@cctld.ru>
рф

// xn--wgbl6a ("Qatar", Arabic) : QA
// http://www.ict.gov.qa/
قطر

// xn--mgberp4a5d4ar ("AlSaudiah", Arabic) : SA
// http://www.nic.net.sa/
السعودية

// xn--mgberp4a5d4a87g ("AlSaudiah", Arabic, variant)  : SA
السعودیة

// xn--mgbqly7c0a67fbc ("AlSaudiah", Arabic, variant) : SA
السعودیۃ

// xn--mgbqly7cvafr ("AlSaudiah", Arabic, variant) : SA
السعوديه

// xn--mgbpl2fh ("sudan", Arabic) : SD
// Operated by .sd registry
سودان

// xn--yfro4i67o Singapore ("Singapore", Chinese) : SG
新加坡

// xn--clchc0ea0b2g2a9gcd ("Singapore", Tamil) : SG
சிங்கப்பூர்

// xn--ogbpf8fl ("Syria", Arabic) : SY
سورية

// xn--mgbtf8fl ("Syria", Arabic, variant) : SY
سوريا

// xn--o3cw4h ("Thai", Thai) : TH
// http://www.thnic.co.th
ไทย
ศึกษา.ไทย
ธุรกิจ.ไทย
รัฐบาล.ไทย
ทหาร.ไทย
เน็ต.ไทย
องค์กร.ไทย

// xn--pgbs0dh ("Tunisia", Arabic) : TN
// http://nic.tn
تونس

// xn--kpry57d ("Taiwan", Chinese, Traditional) : TW
// http://www.twnic.net/english/dn/dn_07a.htm
台灣

// xn--kprw13d ("Taiwan", Chinese, Simplified) : TW
// http://www.twnic.net/english/dn/dn_07a.htm
台湾

// xn--nnx388a ("Taiwan", Chinese, variant) : TW
臺灣

// xn--j1amh ("ukr", Cyrillic) : UA
укр

// xn--mgb2ddes ("AlYemen", Arabic) : YE
اليمن

// xxx : http://icmregistry.com
xxx

// ye : http://www.y.net.ye/services/domain_name.htm
ye
com.ye
edu.ye
gov.ye
net.ye
mil.ye
org.ye

// za : https://www.zadna.org.za/content/page/domain-information/
ac.za
agric.za
alt.za
co.za
edu.za
gov.za
grondar.za
law.za
mil.za
net.za
ngo.za
nic.za
nis.za
nom.za
org.za
school.za
tm.za
web.za

// zm : https://zicta.zm/
// Submitted by registry <info@zicta.zm>
zm
ac.zm
biz.zm
co.zm
com.zm
edu.zm
gov.zm
info.zm
mil.zm
net.zm
org.zm
sch.zm

// zw : https://www.potraz.gov.zw/
// Confirmed by registry <bmtengwa@potraz.gov.zw> 2017-01-25
zw
ac.zw
co.zw
gov.zw
mil.zw
org.zw


// newGTLDs

// List of new gTLDs imported from https://www.icann.org/resources/registries/gtlds/v2/gtlds.json on 2023-10-20T15:11:50Z
// This list is auto-generated, don't edit it manually.
// aaa : American Automobile Association, Inc.
// https://www.iana.org/domains/root/db/aaa.html
aaa

// aarp : AARP
// https://www.iana.org/domains/root/db/aarp.html
aarp

// abb : ABB Ltd
// https://www.iana.org/domains/root/db/abb.html
abb

// abbott : Abbott Laboratories, Inc.
// https://www.iana.org/domains/root/db/abbott.html
abbott

// abbvie : AbbVie Inc.
// https://www.iana.org/domains/root/db/abbvie.html
abbvie

// abc : Disney Enterprises, Inc.
// https://www.iana.org/domains/root/db/abc.html
abc

// able : Able Inc.
// https://www.iana.org/domains/root/db/able.html
able

// abogado : Registry Services, LLC
// https://www.iana.org/domains/root/db/abogado.html
abogado

// abudhabi : Abu Dhabi Systems and Information Centre
// https://www.iana.org/domains/root/db/abudhabi.html
abudhabi

// academy : Binky Moon, LLC
// https://www.iana.org/domains/root/db/academy.html
academy

// accenture : Accenture plc
// https://www.iana.org/domains/root/db/accenture.html
accenture

// accountant : dot Accountant Limited
// https://www.iana.org/domains/root/db/accountant.html
accountant

// accountants : Binky Moon, LLC
// https://www.iana.org/domains/root/db/accountants.html
accountants

// aco : ACO Severin Ahlmann GmbH & Co. KG
// https://www.iana.org/domains/root/db/aco.html
aco

// actor : Dog Beach, LLC
// https://www.iana.org/domains/root/db/actor.html
actor

// ads : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/ads.html
ads

// adult : ICM Registry AD LLC
// https://www.iana.org/domains/root/db/adult.html
adult

// aeg : Aktiebolaget Electrolux
// https://www.iana.org/domains/root/db/aeg.html
aeg

// aetna : Aetna Life Insurance Company
// https://www.iana.org/domains/root/db/aetna.html
aetna

// afl : Australian Football League
// https://www.iana.org/domains/root/db/afl.html
afl

// africa : ZA Central Registry NPC trading as Registry.Africa
// https://www.iana.org/domains/root/db/africa.html
africa

// agakhan : Fondation Aga Khan (Aga Khan Foundation)
// https://www.iana.org/domains/root/db/agakhan.html
agakhan

// agency : Binky Moon, LLC
// https://www.iana.org/domains/root/db/agency.html
agency

// aig : American International Group, Inc.
// https://www.iana.org/domains/root/db/aig.html
aig

// airbus : Airbus S.A.S.
// https://www.iana.org/domains/root/db/airbus.html
airbus

// airforce : Dog Beach, LLC
// https://www.iana.org/domains/root/db/airforce.html
airforce

// airtel : Bharti Airtel Limited
// https://www.iana.org/domains/root/db/airtel.html
airtel

// akdn : Fondation Aga Khan (Aga Khan Foundation)
// https://www.iana.org/domains/root/db/akdn.html
akdn

// alibaba : Alibaba Group Holding Limited
// https://www.iana.org/domains/root/db/alibaba.html
alibaba

// alipay : Alibaba Group Holding Limited
// https://www.iana.org/domains/root/db/alipay.html
alipay

// allfinanz : Allfinanz Deutsche Vermögensberatung Aktiengesellschaft
// https://www.iana.org/domains/root/db/allfinanz.html
allfinanz

// allstate : Allstate Fire and Casualty Insurance Company
// https://www.iana.org/domains/root/db/allstate.html
allstate

// ally : Ally Financial Inc.
// https://www.iana.org/domains/root/db/ally.html
ally

// alsace : Region Grand Est
// https://www.iana.org/domains/root/db/alsace.html
alsace

// alstom : ALSTOM
// https://www.iana.org/domains/root/db/alstom.html
alstom

// amazon : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/amazon.html
amazon

// americanexpress : American Express Travel Related Services Company, Inc.
// https://www.iana.org/domains/root/db/americanexpress.html
americanexpress

// americanfamily : AmFam, Inc.
// https://www.iana.org/domains/root/db/americanfamily.html
americanfamily

// amex : American Express Travel Related Services Company, Inc.
// https://www.iana.org/domains/root/db/amex.html
amex

// amfam : AmFam, Inc.
// https://www.iana.org/domains/root/db/amfam.html
amfam

// amica : Amica Mutual Insurance Company
// https://www.iana.org/domains/root/db/amica.html
amica

// amsterdam : Gemeente Amsterdam
// https://www.iana.org/domains/root/db/amsterdam.html
amsterdam

// analytics : Campus IP LLC
// https://www.iana.org/domains/root/db/analytics.html
analytics

// android : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/android.html
android

// anquan : Beijing Qihu Keji Co., Ltd.
// https://www.iana.org/domains/root/db/anquan.html
anquan

// anz : Australia and New Zealand Banking Group Limited
// https://www.iana.org/domains/root/db/anz.html
anz

// aol : Oath Inc.
// https://www.iana.org/domains/root/db/aol.html
aol

// apartments : Binky Moon, LLC
// https://www.iana.org/domains/root/db/apartments.html
apartments

// app : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/app.html
app

// apple : Apple Inc.
// https://www.iana.org/domains/root/db/apple.html
apple

// aquarelle : Aquarelle.com
// https://www.iana.org/domains/root/db/aquarelle.html
aquarelle

// arab : League of Arab States
// https://www.iana.org/domains/root/db/arab.html
arab

// aramco : Aramco Services Company
// https://www.iana.org/domains/root/db/aramco.html
aramco

// archi : Identity Digital Limited
// https://www.iana.org/domains/root/db/archi.html
archi

// army : Dog Beach, LLC
// https://www.iana.org/domains/root/db/army.html
army

// art : UK Creative Ideas Limited
// https://www.iana.org/domains/root/db/art.html
art

// arte : Association Relative à la Télévision Européenne G.E.I.E.
// https://www.iana.org/domains/root/db/arte.html
arte

// asda : Wal-Mart Stores, Inc.
// https://www.iana.org/domains/root/db/asda.html
asda

// associates : Binky Moon, LLC
// https://www.iana.org/domains/root/db/associates.html
associates

// athleta : The Gap, Inc.
// https://www.iana.org/domains/root/db/athleta.html
athleta

// attorney : Dog Beach, LLC
// https://www.iana.org/domains/root/db/attorney.html
attorney

// auction : Dog Beach, LLC
// https://www.iana.org/domains/root/db/auction.html
auction

// audi : AUDI Aktiengesellschaft
// https://www.iana.org/domains/root/db/audi.html
audi

// audible : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/audible.html
audible

// audio : XYZ.COM LLC
// https://www.iana.org/domains/root/db/audio.html
audio

// auspost : Australian Postal Corporation
// https://www.iana.org/domains/root/db/auspost.html
auspost

// author : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/author.html
author

// auto : XYZ.COM LLC
// https://www.iana.org/domains/root/db/auto.html
auto

// autos : XYZ.COM LLC
// https://www.iana.org/domains/root/db/autos.html
autos

// avianca : Avianca Inc.
// https://www.iana.org/domains/root/db/avianca.html
avianca

// aws : AWS Registry LLC
// https://www.iana.org/domains/root/db/aws.html
aws

// axa : AXA Group Operations SAS
// https://www.iana.org/domains/root/db/axa.html
axa

// azure : Microsoft Corporation
// https://www.iana.org/domains/root/db/azure.html
azure

// baby : XYZ.COM LLC
// https://www.iana.org/domains/root/db/baby.html
baby

// baidu : Baidu, Inc.
// https://www.iana.org/domains/root/db/baidu.html
baidu

// banamex : Citigroup Inc.
// https://www.iana.org/domains/root/db/banamex.html
banamex

// bananarepublic : The Gap, Inc.
// https://www.iana.org/domains/root/db/bananarepublic.html
bananarepublic

// band : Dog Beach, LLC
// https://www.iana.org/domains/root/db/band.html
band

// bank : fTLD Registry Services LLC
// https://www.iana.org/domains/root/db/bank.html
bank

// bar : Punto 2012 Sociedad Anonima Promotora de Inversion de Capital Variable
// https://www.iana.org/domains/root/db/bar.html
bar

// barcelona : Municipi de Barcelona
// https://www.iana.org/domains/root/db/barcelona.html
barcelona

// barclaycard : Barclays Bank PLC
// https://www.iana.org/domains/root/db/barclaycard.html
barclaycard

// barclays : Barclays Bank PLC
// https://www.iana.org/domains/root/db/barclays.html
barclays

// barefoot : Gallo Vineyards, Inc.
// https://www.iana.org/domains/root/db/barefoot.html
barefoot

// bargains : Binky Moon, LLC
// https://www.iana.org/domains/root/db/bargains.html
bargains

// baseball : MLB Advanced Media DH, LLC
// https://www.iana.org/domains/root/db/baseball.html
baseball

// basketball : Fédération Internationale de Basketball (FIBA)
// https://www.iana.org/domains/root/db/basketball.html
basketball

// bauhaus : Werkhaus GmbH
// https://www.iana.org/domains/root/db/bauhaus.html
bauhaus

// bayern : Bayern Connect GmbH
// https://www.iana.org/domains/root/db/bayern.html
bayern

// bbc : British Broadcasting Corporation
// https://www.iana.org/domains/root/db/bbc.html
bbc

// bbt : BB&T Corporation
// https://www.iana.org/domains/root/db/bbt.html
bbt

// bbva : BANCO BILBAO VIZCAYA ARGENTARIA, S.A.
// https://www.iana.org/domains/root/db/bbva.html
bbva

// bcg : The Boston Consulting Group, Inc.
// https://www.iana.org/domains/root/db/bcg.html
bcg

// bcn : Municipi de Barcelona
// https://www.iana.org/domains/root/db/bcn.html
bcn

// beats : Beats Electronics, LLC
// https://www.iana.org/domains/root/db/beats.html
beats

// beauty : XYZ.COM LLC
// https://www.iana.org/domains/root/db/beauty.html
beauty

// beer : Registry Services, LLC
// https://www.iana.org/domains/root/db/beer.html
beer

// bentley : Bentley Motors Limited
// https://www.iana.org/domains/root/db/bentley.html
bentley

// berlin : dotBERLIN GmbH & Co. KG
// https://www.iana.org/domains/root/db/berlin.html
berlin

// best : BestTLD Pty Ltd
// https://www.iana.org/domains/root/db/best.html
best

// bestbuy : BBY Solutions, Inc.
// https://www.iana.org/domains/root/db/bestbuy.html
bestbuy

// bet : Identity Digital Limited
// https://www.iana.org/domains/root/db/bet.html
bet

// bharti : Bharti Enterprises (Holding) Private Limited
// https://www.iana.org/domains/root/db/bharti.html
bharti

// bible : American Bible Society
// https://www.iana.org/domains/root/db/bible.html
bible

// bid : dot Bid Limited
// https://www.iana.org/domains/root/db/bid.html
bid

// bike : Binky Moon, LLC
// https://www.iana.org/domains/root/db/bike.html
bike

// bing : Microsoft Corporation
// https://www.iana.org/domains/root/db/bing.html
bing

// bingo : Binky Moon, LLC
// https://www.iana.org/domains/root/db/bingo.html
bingo

// bio : Identity Digital Limited
// https://www.iana.org/domains/root/db/bio.html
bio

// black : Identity Digital Limited
// https://www.iana.org/domains/root/db/black.html
black

// blackfriday : Registry Services, LLC
// https://www.iana.org/domains/root/db/blackfriday.html
blackfriday

// blockbuster : Dish DBS Corporation
// https://www.iana.org/domains/root/db/blockbuster.html
blockbuster

// blog : Knock Knock WHOIS There, LLC
// https://www.iana.org/domains/root/db/blog.html
blog

// bloomberg : Bloomberg IP Holdings LLC
// https://www.iana.org/domains/root/db/bloomberg.html
bloomberg

// blue : Identity Digital Limited
// https://www.iana.org/domains/root/db/blue.html
blue

// bms : Bristol-Myers Squibb Company
// https://www.iana.org/domains/root/db/bms.html
bms

// bmw : Bayerische Motoren Werke Aktiengesellschaft
// https://www.iana.org/domains/root/db/bmw.html
bmw

// bnpparibas : BNP Paribas
// https://www.iana.org/domains/root/db/bnpparibas.html
bnpparibas

// boats : XYZ.COM LLC
// https://www.iana.org/domains/root/db/boats.html
boats

// boehringer : Boehringer Ingelheim International GmbH
// https://www.iana.org/domains/root/db/boehringer.html
boehringer

// bofa : Bank of America Corporation
// https://www.iana.org/domains/root/db/bofa.html
bofa

// bom : Núcleo de Informação e Coordenação do Ponto BR - NIC.br
// https://www.iana.org/domains/root/db/bom.html
bom

// bond : ShortDot SA
// https://www.iana.org/domains/root/db/bond.html
bond

// boo : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/boo.html
boo

// book : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/book.html
book

// booking : Booking.com B.V.
// https://www.iana.org/domains/root/db/booking.html
booking

// bosch : Robert Bosch GMBH
// https://www.iana.org/domains/root/db/bosch.html
bosch

// bostik : Bostik SA
// https://www.iana.org/domains/root/db/bostik.html
bostik

// boston : Registry Services, LLC
// https://www.iana.org/domains/root/db/boston.html
boston

// bot : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/bot.html
bot

// boutique : Binky Moon, LLC
// https://www.iana.org/domains/root/db/boutique.html
boutique

// box : Intercap Registry Inc.
// https://www.iana.org/domains/root/db/box.html
box

// bradesco : Banco Bradesco S.A.
// https://www.iana.org/domains/root/db/bradesco.html
bradesco

// bridgestone : Bridgestone Corporation
// https://www.iana.org/domains/root/db/bridgestone.html
bridgestone

// broadway : Celebrate Broadway, Inc.
// https://www.iana.org/domains/root/db/broadway.html
broadway

// broker : Dog Beach, LLC
// https://www.iana.org/domains/root/db/broker.html
broker

// brother : Brother Industries, Ltd.
// https://www.iana.org/domains/root/db/brother.html
brother

// brussels : DNS.be vzw
// https://www.iana.org/domains/root/db/brussels.html
brussels

// build : Plan Bee LLC
// https://www.iana.org/domains/root/db/build.html
build

// builders : Binky Moon, LLC
// https://www.iana.org/domains/root/db/builders.html
builders

// business : Binky Moon, LLC
// https://www.iana.org/domains/root/db/business.html
business

// buy : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/buy.html
buy

// buzz : DOTSTRATEGY CO.
// https://www.iana.org/domains/root/db/buzz.html
buzz

// bzh : Association www.bzh
// https://www.iana.org/domains/root/db/bzh.html
bzh

// cab : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cab.html
cab

// cafe : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cafe.html
cafe

// cal : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/cal.html
cal

// call : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/call.html
call

// calvinklein : PVH gTLD Holdings LLC
// https://www.iana.org/domains/root/db/calvinklein.html
calvinklein

// cam : Cam Connecting SARL
// https://www.iana.org/domains/root/db/cam.html
cam

// camera : Binky Moon, LLC
// https://www.iana.org/domains/root/db/camera.html
camera

// camp : Binky Moon, LLC
// https://www.iana.org/domains/root/db/camp.html
camp

// canon : Canon Inc.
// https://www.iana.org/domains/root/db/canon.html
canon

// capetown : ZA Central Registry NPC trading as ZA Central Registry
// https://www.iana.org/domains/root/db/capetown.html
capetown

// capital : Binky Moon, LLC
// https://www.iana.org/domains/root/db/capital.html
capital

// capitalone : Capital One Financial Corporation
// https://www.iana.org/domains/root/db/capitalone.html
capitalone

// car : XYZ.COM LLC
// https://www.iana.org/domains/root/db/car.html
car

// caravan : Caravan International, Inc.
// https://www.iana.org/domains/root/db/caravan.html
caravan

// cards : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cards.html
cards

// care : Binky Moon, LLC
// https://www.iana.org/domains/root/db/care.html
care

// career : dotCareer LLC
// https://www.iana.org/domains/root/db/career.html
career

// careers : Binky Moon, LLC
// https://www.iana.org/domains/root/db/careers.html
careers

// cars : XYZ.COM LLC
// https://www.iana.org/domains/root/db/cars.html
cars

// casa : Registry Services, LLC
// https://www.iana.org/domains/root/db/casa.html
casa

// case : Digity, LLC
// https://www.iana.org/domains/root/db/case.html
case

// cash : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cash.html
cash

// casino : Binky Moon, LLC
// https://www.iana.org/domains/root/db/casino.html
casino

// catering : Binky Moon, LLC
// https://www.iana.org/domains/root/db/catering.html
catering

// catholic : Pontificium Consilium de Comunicationibus Socialibus (PCCS) (Pontifical Council for Social Communication)
// https://www.iana.org/domains/root/db/catholic.html
catholic

// cba : COMMONWEALTH BANK OF AUSTRALIA
// https://www.iana.org/domains/root/db/cba.html
cba

// cbn : The Christian Broadcasting Network, Inc.
// https://www.iana.org/domains/root/db/cbn.html
cbn

// cbre : CBRE, Inc.
// https://www.iana.org/domains/root/db/cbre.html
cbre

// cbs : CBS Domains Inc.
// https://www.iana.org/domains/root/db/cbs.html
cbs

// center : Binky Moon, LLC
// https://www.iana.org/domains/root/db/center.html
center

// ceo : XYZ.COM LLC
// https://www.iana.org/domains/root/db/ceo.html
ceo

// cern : European Organization for Nuclear Research ("CERN")
// https://www.iana.org/domains/root/db/cern.html
cern

// cfa : CFA Institute
// https://www.iana.org/domains/root/db/cfa.html
cfa

// cfd : ShortDot SA
// https://www.iana.org/domains/root/db/cfd.html
cfd

// chanel : Chanel International B.V.
// https://www.iana.org/domains/root/db/chanel.html
chanel

// channel : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/channel.html
channel

// charity : Public Interest Registry
// https://www.iana.org/domains/root/db/charity.html
charity

// chase : JPMorgan Chase Bank, National Association
// https://www.iana.org/domains/root/db/chase.html
chase

// chat : Binky Moon, LLC
// https://www.iana.org/domains/root/db/chat.html
chat

// cheap : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cheap.html
cheap

// chintai : CHINTAI Corporation
// https://www.iana.org/domains/root/db/chintai.html
chintai

// christmas : XYZ.COM LLC
// https://www.iana.org/domains/root/db/christmas.html
christmas

// chrome : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/chrome.html
chrome

// church : Binky Moon, LLC
// https://www.iana.org/domains/root/db/church.html
church

// cipriani : Hotel Cipriani Srl
// https://www.iana.org/domains/root/db/cipriani.html
cipriani

// circle : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/circle.html
circle

// cisco : Cisco Technology, Inc.
// https://www.iana.org/domains/root/db/cisco.html
cisco

// citadel : Citadel Domain LLC
// https://www.iana.org/domains/root/db/citadel.html
citadel

// citi : Citigroup Inc.
// https://www.iana.org/domains/root/db/citi.html
citi

// citic : CITIC Group Corporation
// https://www.iana.org/domains/root/db/citic.html
citic

// city : Binky Moon, LLC
// https://www.iana.org/domains/root/db/city.html
city

// claims : Binky Moon, LLC
// https://www.iana.org/domains/root/db/claims.html
claims

// cleaning : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cleaning.html
cleaning

// click : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/click.html
click

// clinic : Binky Moon, LLC
// https://www.iana.org/domains/root/db/clinic.html
clinic

// clinique : The Estée Lauder Companies Inc.
// https://www.iana.org/domains/root/db/clinique.html
clinique

// clothing : Binky Moon, LLC
// https://www.iana.org/domains/root/db/clothing.html
clothing

// cloud : Aruba PEC S.p.A.
// https://www.iana.org/domains/root/db/cloud.html
cloud

// club : Registry Services, LLC
// https://www.iana.org/domains/root/db/club.html
club

// clubmed : Club Méditerranée S.A.
// https://www.iana.org/domains/root/db/clubmed.html
clubmed

// coach : Binky Moon, LLC
// https://www.iana.org/domains/root/db/coach.html
coach

// codes : Binky Moon, LLC
// https://www.iana.org/domains/root/db/codes.html
codes

// coffee : Binky Moon, LLC
// https://www.iana.org/domains/root/db/coffee.html
coffee

// college : XYZ.COM LLC
// https://www.iana.org/domains/root/db/college.html
college

// cologne : dotKoeln GmbH
// https://www.iana.org/domains/root/db/cologne.html
cologne

// comcast : Comcast IP Holdings I, LLC
// https://www.iana.org/domains/root/db/comcast.html
comcast

// commbank : COMMONWEALTH BANK OF AUSTRALIA
// https://www.iana.org/domains/root/db/commbank.html
commbank

// community : Binky Moon, LLC
// https://www.iana.org/domains/root/db/community.html
community

// company : Binky Moon, LLC
// https://www.iana.org/domains/root/db/company.html
company

// compare : Registry Services, LLC
// https://www.iana.org/domains/root/db/compare.html
compare

// computer : Binky Moon, LLC
// https://www.iana.org/domains/root/db/computer.html
computer

// comsec : VeriSign, Inc.
// https://www.iana.org/domains/root/db/comsec.html
comsec

// condos : Binky Moon, LLC
// https://www.iana.org/domains/root/db/condos.html
condos

// construction : Binky Moon, LLC
// https://www.iana.org/domains/root/db/construction.html
construction

// consulting : Dog Beach, LLC
// https://www.iana.org/domains/root/db/consulting.html
consulting

// contact : Dog Beach, LLC
// https://www.iana.org/domains/root/db/contact.html
contact

// contractors : Binky Moon, LLC
// https://www.iana.org/domains/root/db/contractors.html
contractors

// cooking : Registry Services, LLC
// https://www.iana.org/domains/root/db/cooking.html
cooking

// cool : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cool.html
cool

// corsica : Collectivité de Corse
// https://www.iana.org/domains/root/db/corsica.html
corsica

// country : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/country.html
country

// coupon : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/coupon.html
coupon

// coupons : Binky Moon, LLC
// https://www.iana.org/domains/root/db/coupons.html
coupons

// courses : Registry Services, LLC
// https://www.iana.org/domains/root/db/courses.html
courses

// cpa : American Institute of Certified Public Accountants
// https://www.iana.org/domains/root/db/cpa.html
cpa

// credit : Binky Moon, LLC
// https://www.iana.org/domains/root/db/credit.html
credit

// creditcard : Binky Moon, LLC
// https://www.iana.org/domains/root/db/creditcard.html
creditcard

// creditunion : DotCooperation LLC
// https://www.iana.org/domains/root/db/creditunion.html
creditunion

// cricket : dot Cricket Limited
// https://www.iana.org/domains/root/db/cricket.html
cricket

// crown : Crown Equipment Corporation
// https://www.iana.org/domains/root/db/crown.html
crown

// crs : Federated Co-operatives Limited
// https://www.iana.org/domains/root/db/crs.html
crs

// cruise : Viking River Cruises (Bermuda) Ltd.
// https://www.iana.org/domains/root/db/cruise.html
cruise

// cruises : Binky Moon, LLC
// https://www.iana.org/domains/root/db/cruises.html
cruises

// cuisinella : SCHMIDT GROUPE S.A.S.
// https://www.iana.org/domains/root/db/cuisinella.html
cuisinella

// cymru : Nominet UK
// https://www.iana.org/domains/root/db/cymru.html
cymru

// cyou : ShortDot SA
// https://www.iana.org/domains/root/db/cyou.html
cyou

// dabur : Dabur India Limited
// https://www.iana.org/domains/root/db/dabur.html
dabur

// dad : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/dad.html
dad

// dance : Dog Beach, LLC
// https://www.iana.org/domains/root/db/dance.html
dance

// data : Dish DBS Corporation
// https://www.iana.org/domains/root/db/data.html
data

// date : dot Date Limited
// https://www.iana.org/domains/root/db/date.html
date

// dating : Binky Moon, LLC
// https://www.iana.org/domains/root/db/dating.html
dating

// datsun : NISSAN MOTOR CO., LTD.
// https://www.iana.org/domains/root/db/datsun.html
datsun

// day : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/day.html
day

// dclk : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/dclk.html
dclk

// dds : Registry Services, LLC
// https://www.iana.org/domains/root/db/dds.html
dds

// deal : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/deal.html
deal

// dealer : Intercap Registry Inc.
// https://www.iana.org/domains/root/db/dealer.html
dealer

// deals : Binky Moon, LLC
// https://www.iana.org/domains/root/db/deals.html
deals

// degree : Dog Beach, LLC
// https://www.iana.org/domains/root/db/degree.html
degree

// delivery : Binky Moon, LLC
// https://www.iana.org/domains/root/db/delivery.html
delivery

// dell : Dell Inc.
// https://www.iana.org/domains/root/db/dell.html
dell

// deloitte : Deloitte Touche Tohmatsu
// https://www.iana.org/domains/root/db/deloitte.html
deloitte

// delta : Delta Air Lines, Inc.
// https://www.iana.org/domains/root/db/delta.html
delta

// democrat : Dog Beach, LLC
// https://www.iana.org/domains/root/db/democrat.html
democrat

// dental : Binky Moon, LLC
// https://www.iana.org/domains/root/db/dental.html
dental

// dentist : Dog Beach, LLC
// https://www.iana.org/domains/root/db/dentist.html
dentist

// desi : Desi Networks LLC
// https://www.iana.org/domains/root/db/desi.html
desi

// design : Registry Services, LLC
// https://www.iana.org/domains/root/db/design.html
design

// dev : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/dev.html
dev

// dhl : Deutsche Post AG
// https://www.iana.org/domains/root/db/dhl.html
dhl

// diamonds : Binky Moon, LLC
// https://www.iana.org/domains/root/db/diamonds.html
diamonds

// diet : XYZ.COM LLC
// https://www.iana.org/domains/root/db/diet.html
diet

// digital : Binky Moon, LLC
// https://www.iana.org/domains/root/db/digital.html
digital

// direct : Binky Moon, LLC
// https://www.iana.org/domains/root/db/direct.html
direct

// directory : Binky Moon, LLC
// https://www.iana.org/domains/root/db/directory.html
directory

// discount : Binky Moon, LLC
// https://www.iana.org/domains/root/db/discount.html
discount

// discover : Discover Financial Services
// https://www.iana.org/domains/root/db/discover.html
discover

// dish : Dish DBS Corporation
// https://www.iana.org/domains/root/db/dish.html
dish

// diy : Lifestyle Domain Holdings, Inc.
// https://www.iana.org/domains/root/db/diy.html
diy

// dnp : Dai Nippon Printing Co., Ltd.
// https://www.iana.org/domains/root/db/dnp.html
dnp

// docs : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/docs.html
docs

// doctor : Binky Moon, LLC
// https://www.iana.org/domains/root/db/doctor.html
doctor

// dog : Binky Moon, LLC
// https://www.iana.org/domains/root/db/dog.html
dog

// domains : Binky Moon, LLC
// https://www.iana.org/domains/root/db/domains.html
domains

// dot : Dish DBS Corporation
// https://www.iana.org/domains/root/db/dot.html
dot

// download : dot Support Limited
// https://www.iana.org/domains/root/db/download.html
download

// drive : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/drive.html
drive

// dtv : Dish DBS Corporation
// https://www.iana.org/domains/root/db/dtv.html
dtv

// dubai : Dubai Smart Government Department
// https://www.iana.org/domains/root/db/dubai.html
dubai

// dunlop : The Goodyear Tire & Rubber Company
// https://www.iana.org/domains/root/db/dunlop.html
dunlop

// dupont : DuPont Specialty Products USA, LLC
// https://www.iana.org/domains/root/db/dupont.html
dupont

// durban : ZA Central Registry NPC trading as ZA Central Registry
// https://www.iana.org/domains/root/db/durban.html
durban

// dvag : Deutsche Vermögensberatung Aktiengesellschaft DVAG
// https://www.iana.org/domains/root/db/dvag.html
dvag

// dvr : DISH Technologies L.L.C.
// https://www.iana.org/domains/root/db/dvr.html
dvr

// earth : Interlink Systems Innovation Institute K.K.
// https://www.iana.org/domains/root/db/earth.html
earth

// eat : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/eat.html
eat

// eco : Big Room Inc.
// https://www.iana.org/domains/root/db/eco.html
eco

// edeka : EDEKA Verband kaufmännischer Genossenschaften e.V.
// https://www.iana.org/domains/root/db/edeka.html
edeka

// education : Binky Moon, LLC
// https://www.iana.org/domains/root/db/education.html
education

// email : Binky Moon, LLC
// https://www.iana.org/domains/root/db/email.html
email

// emerck : Merck KGaA
// https://www.iana.org/domains/root/db/emerck.html
emerck

// energy : Binky Moon, LLC
// https://www.iana.org/domains/root/db/energy.html
energy

// engineer : Dog Beach, LLC
// https://www.iana.org/domains/root/db/engineer.html
engineer

// engineering : Binky Moon, LLC
// https://www.iana.org/domains/root/db/engineering.html
engineering

// enterprises : Binky Moon, LLC
// https://www.iana.org/domains/root/db/enterprises.html
enterprises

// epson : Seiko Epson Corporation
// https://www.iana.org/domains/root/db/epson.html
epson

// equipment : Binky Moon, LLC
// https://www.iana.org/domains/root/db/equipment.html
equipment

// ericsson : Telefonaktiebolaget L M Ericsson
// https://www.iana.org/domains/root/db/ericsson.html
ericsson

// erni : ERNI Group Holding AG
// https://www.iana.org/domains/root/db/erni.html
erni

// esq : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/esq.html
esq

// estate : Binky Moon, LLC
// https://www.iana.org/domains/root/db/estate.html
estate

// etisalat : Emirates Telecommunications Corporation (trading as Etisalat)
// https://www.iana.org/domains/root/db/etisalat.html
etisalat

// eurovision : European Broadcasting Union (EBU)
// https://www.iana.org/domains/root/db/eurovision.html
eurovision

// eus : Puntueus Fundazioa
// https://www.iana.org/domains/root/db/eus.html
eus

// events : Binky Moon, LLC
// https://www.iana.org/domains/root/db/events.html
events

// exchange : Binky Moon, LLC
// https://www.iana.org/domains/root/db/exchange.html
exchange

// expert : Binky Moon, LLC
// https://www.iana.org/domains/root/db/expert.html
expert

// exposed : Binky Moon, LLC
// https://www.iana.org/domains/root/db/exposed.html
exposed

// express : Binky Moon, LLC
// https://www.iana.org/domains/root/db/express.html
express

// extraspace : Extra Space Storage LLC
// https://www.iana.org/domains/root/db/extraspace.html
extraspace

// fage : Fage International S.A.
// https://www.iana.org/domains/root/db/fage.html
fage

// fail : Binky Moon, LLC
// https://www.iana.org/domains/root/db/fail.html
fail

// fairwinds : FairWinds Partners, LLC
// https://www.iana.org/domains/root/db/fairwinds.html
fairwinds

// faith : dot Faith Limited
// https://www.iana.org/domains/root/db/faith.html
faith

// family : Dog Beach, LLC
// https://www.iana.org/domains/root/db/family.html
family

// fan : Dog Beach, LLC
// https://www.iana.org/domains/root/db/fan.html
fan

// fans : ZDNS International Limited
// https://www.iana.org/domains/root/db/fans.html
fans

// farm : Binky Moon, LLC
// https://www.iana.org/domains/root/db/farm.html
farm

// farmers : Farmers Insurance Exchange
// https://www.iana.org/domains/root/db/farmers.html
farmers

// fashion : Registry Services, LLC
// https://www.iana.org/domains/root/db/fashion.html
fashion

// fast : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/fast.html
fast

// fedex : Federal Express Corporation
// https://www.iana.org/domains/root/db/fedex.html
fedex

// feedback : Top Level Spectrum, Inc.
// https://www.iana.org/domains/root/db/feedback.html
feedback

// ferrari : Fiat Chrysler Automobiles N.V.
// https://www.iana.org/domains/root/db/ferrari.html
ferrari

// ferrero : Ferrero Trading Lux S.A.
// https://www.iana.org/domains/root/db/ferrero.html
ferrero

// fidelity : Fidelity Brokerage Services LLC
// https://www.iana.org/domains/root/db/fidelity.html
fidelity

// fido : Rogers Communications Canada Inc.
// https://www.iana.org/domains/root/db/fido.html
fido

// film : Motion Picture Domain Registry Pty Ltd
// https://www.iana.org/domains/root/db/film.html
film

// final : Núcleo de Informação e Coordenação do Ponto BR - NIC.br
// https://www.iana.org/domains/root/db/final.html
final

// finance : Binky Moon, LLC
// https://www.iana.org/domains/root/db/finance.html
finance

// financial : Binky Moon, LLC
// https://www.iana.org/domains/root/db/financial.html
financial

// fire : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/fire.html
fire

// firestone : Bridgestone Licensing Services, Inc
// https://www.iana.org/domains/root/db/firestone.html
firestone

// firmdale : Firmdale Holdings Limited
// https://www.iana.org/domains/root/db/firmdale.html
firmdale

// fish : Binky Moon, LLC
// https://www.iana.org/domains/root/db/fish.html
fish

// fishing : Registry Services, LLC
// https://www.iana.org/domains/root/db/fishing.html
fishing

// fit : Registry Services, LLC
// https://www.iana.org/domains/root/db/fit.html
fit

// fitness : Binky Moon, LLC
// https://www.iana.org/domains/root/db/fitness.html
fitness

// flickr : Flickr, Inc.
// https://www.iana.org/domains/root/db/flickr.html
flickr

// flights : Binky Moon, LLC
// https://www.iana.org/domains/root/db/flights.html
flights

// flir : FLIR Systems, Inc.
// https://www.iana.org/domains/root/db/flir.html
flir

// florist : Binky Moon, LLC
// https://www.iana.org/domains/root/db/florist.html
florist

// flowers : XYZ.COM LLC
// https://www.iana.org/domains/root/db/flowers.html
flowers

// fly : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/fly.html
fly

// foo : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/foo.html
foo

// food : Lifestyle Domain Holdings, Inc.
// https://www.iana.org/domains/root/db/food.html
food

// football : Binky Moon, LLC
// https://www.iana.org/domains/root/db/football.html
football

// ford : Ford Motor Company
// https://www.iana.org/domains/root/db/ford.html
ford

// forex : Dog Beach, LLC
// https://www.iana.org/domains/root/db/forex.html
forex

// forsale : Dog Beach, LLC
// https://www.iana.org/domains/root/db/forsale.html
forsale

// forum : Fegistry, LLC
// https://www.iana.org/domains/root/db/forum.html
forum

// foundation : Public Interest Registry
// https://www.iana.org/domains/root/db/foundation.html
foundation

// fox : FOX Registry, LLC
// https://www.iana.org/domains/root/db/fox.html
fox

// free : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/free.html
free

// fresenius : Fresenius Immobilien-Verwaltungs-GmbH
// https://www.iana.org/domains/root/db/fresenius.html
fresenius

// frl : FRLregistry B.V.
// https://www.iana.org/domains/root/db/frl.html
frl

// frogans : OP3FT
// https://www.iana.org/domains/root/db/frogans.html
frogans

// frontier : Frontier Communications Corporation
// https://www.iana.org/domains/root/db/frontier.html
frontier

// ftr : Frontier Communications Corporation
// https://www.iana.org/domains/root/db/ftr.html
ftr

// fujitsu : Fujitsu Limited
// https://www.iana.org/domains/root/db/fujitsu.html
fujitsu

// fun : Radix FZC DMCC
// https://www.iana.org/domains/root/db/fun.html
fun

// fund : Binky Moon, LLC
// https://www.iana.org/domains/root/db/fund.html
fund

// furniture : Binky Moon, LLC
// https://www.iana.org/domains/root/db/furniture.html
furniture

// futbol : Dog Beach, LLC
// https://www.iana.org/domains/root/db/futbol.html
futbol

// fyi : Binky Moon, LLC
// https://www.iana.org/domains/root/db/fyi.html
fyi

// gal : Asociación puntoGAL
// https://www.iana.org/domains/root/db/gal.html
gal

// gallery : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gallery.html
gallery

// gallo : Gallo Vineyards, Inc.
// https://www.iana.org/domains/root/db/gallo.html
gallo

// gallup : Gallup, Inc.
// https://www.iana.org/domains/root/db/gallup.html
gallup

// game : XYZ.COM LLC
// https://www.iana.org/domains/root/db/game.html
game

// games : Dog Beach, LLC
// https://www.iana.org/domains/root/db/games.html
games

// gap : The Gap, Inc.
// https://www.iana.org/domains/root/db/gap.html
gap

// garden : Registry Services, LLC
// https://www.iana.org/domains/root/db/garden.html
garden

// gay : Registry Services, LLC
// https://www.iana.org/domains/root/db/gay.html
gay

// gbiz : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/gbiz.html
gbiz

// gdn : Joint Stock Company "Navigation-information systems"
// https://www.iana.org/domains/root/db/gdn.html
gdn

// gea : GEA Group Aktiengesellschaft
// https://www.iana.org/domains/root/db/gea.html
gea

// gent : Easyhost BV
// https://www.iana.org/domains/root/db/gent.html
gent

// genting : Resorts World Inc Pte. Ltd.
// https://www.iana.org/domains/root/db/genting.html
genting

// george : Wal-Mart Stores, Inc.
// https://www.iana.org/domains/root/db/george.html
george

// ggee : GMO Internet, Inc.
// https://www.iana.org/domains/root/db/ggee.html
ggee

// gift : DotGift, LLC
// https://www.iana.org/domains/root/db/gift.html
gift

// gifts : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gifts.html
gifts

// gives : Public Interest Registry
// https://www.iana.org/domains/root/db/gives.html
gives

// giving : Public Interest Registry
// https://www.iana.org/domains/root/db/giving.html
giving

// glass : Binky Moon, LLC
// https://www.iana.org/domains/root/db/glass.html
glass

// gle : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/gle.html
gle

// global : Identity Digital Limited
// https://www.iana.org/domains/root/db/global.html
global

// globo : Globo Comunicação e Participações S.A
// https://www.iana.org/domains/root/db/globo.html
globo

// gmail : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/gmail.html
gmail

// gmbh : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gmbh.html
gmbh

// gmo : GMO Internet, Inc.
// https://www.iana.org/domains/root/db/gmo.html
gmo

// gmx : 1&1 Mail & Media GmbH
// https://www.iana.org/domains/root/db/gmx.html
gmx

// godaddy : Go Daddy East, LLC
// https://www.iana.org/domains/root/db/godaddy.html
godaddy

// gold : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gold.html
gold

// goldpoint : YODOBASHI CAMERA CO.,LTD.
// https://www.iana.org/domains/root/db/goldpoint.html
goldpoint

// golf : Binky Moon, LLC
// https://www.iana.org/domains/root/db/golf.html
golf

// goo : NTT Resonant Inc.
// https://www.iana.org/domains/root/db/goo.html
goo

// goodyear : The Goodyear Tire & Rubber Company
// https://www.iana.org/domains/root/db/goodyear.html
goodyear

// goog : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/goog.html
goog

// google : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/google.html
google

// gop : Republican State Leadership Committee, Inc.
// https://www.iana.org/domains/root/db/gop.html
gop

// got : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/got.html
got

// grainger : Grainger Registry Services, LLC
// https://www.iana.org/domains/root/db/grainger.html
grainger

// graphics : Binky Moon, LLC
// https://www.iana.org/domains/root/db/graphics.html
graphics

// gratis : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gratis.html
gratis

// green : Identity Digital Limited
// https://www.iana.org/domains/root/db/green.html
green

// gripe : Binky Moon, LLC
// https://www.iana.org/domains/root/db/gripe.html
gripe

// grocery : Wal-Mart Stores, Inc.
// https://www.iana.org/domains/root/db/grocery.html
grocery

// group : Binky Moon, LLC
// https://www.iana.org/domains/root/db/group.html
group

// guardian : The Guardian Life Insurance Company of America
// https://www.iana.org/domains/root/db/guardian.html
guardian

// gucci : Guccio Gucci S.p.a.
// https://www.iana.org/domains/root/db/gucci.html
gucci

// guge : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/guge.html
guge

// guide : Binky Moon, LLC
// https://www.iana.org/domains/root/db/guide.html
guide

// guitars : XYZ.COM LLC
// https://www.iana.org/domains/root/db/guitars.html
guitars

// guru : Binky Moon, LLC
// https://www.iana.org/domains/root/db/guru.html
guru

// hair : XYZ.COM LLC
// https://www.iana.org/domains/root/db/hair.html
hair

// hamburg : Hamburg Top-Level-Domain GmbH
// https://www.iana.org/domains/root/db/hamburg.html
hamburg

// hangout : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/hangout.html
hangout

// haus : Dog Beach, LLC
// https://www.iana.org/domains/root/db/haus.html
haus

// hbo : HBO Registry Services, Inc.
// https://www.iana.org/domains/root/db/hbo.html
hbo

// hdfc : HOUSING DEVELOPMENT FINANCE CORPORATION LIMITED
// https://www.iana.org/domains/root/db/hdfc.html
hdfc

// hdfcbank : HDFC Bank Limited
// https://www.iana.org/domains/root/db/hdfcbank.html
hdfcbank

// health : Registry Services, LLC
// https://www.iana.org/domains/root/db/health.html
health

// healthcare : Binky Moon, LLC
// https://www.iana.org/domains/root/db/healthcare.html
healthcare

// help : Innovation service Limited
// https://www.iana.org/domains/root/db/help.html
help

// helsinki : City of Helsinki
// https://www.iana.org/domains/root/db/helsinki.html
helsinki

// here : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/here.html
here

// hermes : HERMES INTERNATIONAL
// https://www.iana.org/domains/root/db/hermes.html
hermes

// hiphop : Dot Hip Hop, LLC
// https://www.iana.org/domains/root/db/hiphop.html
hiphop

// hisamitsu : Hisamitsu Pharmaceutical Co.,Inc.
// https://www.iana.org/domains/root/db/hisamitsu.html
hisamitsu

// hitachi : Hitachi, Ltd.
// https://www.iana.org/domains/root/db/hitachi.html
hitachi

// hiv : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/hiv.html
hiv

// hkt : PCCW-HKT DataCom Services Limited
// https://www.iana.org/domains/root/db/hkt.html
hkt

// hockey : Binky Moon, LLC
// https://www.iana.org/domains/root/db/hockey.html
hockey

// holdings : Binky Moon, LLC
// https://www.iana.org/domains/root/db/holdings.html
holdings

// holiday : Binky Moon, LLC
// https://www.iana.org/domains/root/db/holiday.html
holiday

// homedepot : Home Depot Product Authority, LLC
// https://www.iana.org/domains/root/db/homedepot.html
homedepot

// homegoods : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/homegoods.html
homegoods

// homes : XYZ.COM LLC
// https://www.iana.org/domains/root/db/homes.html
homes

// homesense : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/homesense.html
homesense

// honda : Honda Motor Co., Ltd.
// https://www.iana.org/domains/root/db/honda.html
honda

// horse : Registry Services, LLC
// https://www.iana.org/domains/root/db/horse.html
horse

// hospital : Binky Moon, LLC
// https://www.iana.org/domains/root/db/hospital.html
hospital

// host : Radix FZC DMCC
// https://www.iana.org/domains/root/db/host.html
host

// hosting : XYZ.COM LLC
// https://www.iana.org/domains/root/db/hosting.html
hosting

// hot : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/hot.html
hot

// hotels : Booking.com B.V.
// https://www.iana.org/domains/root/db/hotels.html
hotels

// hotmail : Microsoft Corporation
// https://www.iana.org/domains/root/db/hotmail.html
hotmail

// house : Binky Moon, LLC
// https://www.iana.org/domains/root/db/house.html
house

// how : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/how.html
how

// hsbc : HSBC Global Services (UK) Limited
// https://www.iana.org/domains/root/db/hsbc.html
hsbc

// hughes : Hughes Satellite Systems Corporation
// https://www.iana.org/domains/root/db/hughes.html
hughes

// hyatt : Hyatt GTLD, L.L.C.
// https://www.iana.org/domains/root/db/hyatt.html
hyatt

// hyundai : Hyundai Motor Company
// https://www.iana.org/domains/root/db/hyundai.html
hyundai

// ibm : International Business Machines Corporation
// https://www.iana.org/domains/root/db/ibm.html
ibm

// icbc : Industrial and Commercial Bank of China Limited
// https://www.iana.org/domains/root/db/icbc.html
icbc

// ice : IntercontinentalExchange, Inc.
// https://www.iana.org/domains/root/db/ice.html
ice

// icu : ShortDot SA
// https://www.iana.org/domains/root/db/icu.html
icu

// ieee : IEEE Global LLC
// https://www.iana.org/domains/root/db/ieee.html
ieee

// ifm : ifm electronic gmbh
// https://www.iana.org/domains/root/db/ifm.html
ifm

// ikano : Ikano S.A.
// https://www.iana.org/domains/root/db/ikano.html
ikano

// imamat : Fondation Aga Khan (Aga Khan Foundation)
// https://www.iana.org/domains/root/db/imamat.html
imamat

// imdb : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/imdb.html
imdb

// immo : Binky Moon, LLC
// https://www.iana.org/domains/root/db/immo.html
immo

// immobilien : Dog Beach, LLC
// https://www.iana.org/domains/root/db/immobilien.html
immobilien

// inc : Intercap Registry Inc.
// https://www.iana.org/domains/root/db/inc.html
inc

// industries : Binky Moon, LLC
// https://www.iana.org/domains/root/db/industries.html
industries

// infiniti : NISSAN MOTOR CO., LTD.
// https://www.iana.org/domains/root/db/infiniti.html
infiniti

// ing : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/ing.html
ing

// ink : Registry Services, LLC
// https://www.iana.org/domains/root/db/ink.html
ink

// institute : Binky Moon, LLC
// https://www.iana.org/domains/root/db/institute.html
institute

// insurance : fTLD Registry Services LLC
// https://www.iana.org/domains/root/db/insurance.html
insurance

// insure : Binky Moon, LLC
// https://www.iana.org/domains/root/db/insure.html
insure

// international : Binky Moon, LLC
// https://www.iana.org/domains/root/db/international.html
international

// intuit : Intuit Administrative Services, Inc.
// https://www.iana.org/domains/root/db/intuit.html
intuit

// investments : Binky Moon, LLC
// https://www.iana.org/domains/root/db/investments.html
investments

// ipiranga : Ipiranga Produtos de Petroleo S.A.
// https://www.iana.org/domains/root/db/ipiranga.html
ipiranga

// irish : Binky Moon, LLC
// https://www.iana.org/domains/root/db/irish.html
irish

// ismaili : Fondation Aga Khan (Aga Khan Foundation)
// https://www.iana.org/domains/root/db/ismaili.html
ismaili

// ist : Istanbul Metropolitan Municipality
// https://www.iana.org/domains/root/db/ist.html
ist

// istanbul : Istanbul Metropolitan Municipality
// https://www.iana.org/domains/root/db/istanbul.html
istanbul

// itau : Itau Unibanco Holding S.A.
// https://www.iana.org/domains/root/db/itau.html
itau

// itv : ITV Services Limited
// https://www.iana.org/domains/root/db/itv.html
itv

// jaguar : Jaguar Land Rover Ltd
// https://www.iana.org/domains/root/db/jaguar.html
jaguar

// java : Oracle Corporation
// https://www.iana.org/domains/root/db/java.html
java

// jcb : JCB Co., Ltd.
// https://www.iana.org/domains/root/db/jcb.html
jcb

// jeep : FCA US LLC.
// https://www.iana.org/domains/root/db/jeep.html
jeep

// jetzt : Binky Moon, LLC
// https://www.iana.org/domains/root/db/jetzt.html
jetzt

// jewelry : Binky Moon, LLC
// https://www.iana.org/domains/root/db/jewelry.html
jewelry

// jio : Reliance Industries Limited
// https://www.iana.org/domains/root/db/jio.html
jio

// jll : Jones Lang LaSalle Incorporated
// https://www.iana.org/domains/root/db/jll.html
jll

// jmp : Matrix IP LLC
// https://www.iana.org/domains/root/db/jmp.html
jmp

// jnj : Johnson & Johnson Services, Inc.
// https://www.iana.org/domains/root/db/jnj.html
jnj

// joburg : ZA Central Registry NPC trading as ZA Central Registry
// https://www.iana.org/domains/root/db/joburg.html
joburg

// jot : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/jot.html
jot

// joy : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/joy.html
joy

// jpmorgan : JPMorgan Chase Bank, National Association
// https://www.iana.org/domains/root/db/jpmorgan.html
jpmorgan

// jprs : Japan Registry Services Co., Ltd.
// https://www.iana.org/domains/root/db/jprs.html
jprs

// juegos : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/juegos.html
juegos

// juniper : JUNIPER NETWORKS, INC.
// https://www.iana.org/domains/root/db/juniper.html
juniper

// kaufen : Dog Beach, LLC
// https://www.iana.org/domains/root/db/kaufen.html
kaufen

// kddi : KDDI CORPORATION
// https://www.iana.org/domains/root/db/kddi.html
kddi

// kerryhotels : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/kerryhotels.html
kerryhotels

// kerrylogistics : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/kerrylogistics.html
kerrylogistics

// kerryproperties : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/kerryproperties.html
kerryproperties

// kfh : Kuwait Finance House
// https://www.iana.org/domains/root/db/kfh.html
kfh

// kia : KIA MOTORS CORPORATION
// https://www.iana.org/domains/root/db/kia.html
kia

// kids : DotKids Foundation Limited
// https://www.iana.org/domains/root/db/kids.html
kids

// kim : Identity Digital Limited
// https://www.iana.org/domains/root/db/kim.html
kim

// kinder : Ferrero Trading Lux S.A.
// https://www.iana.org/domains/root/db/kinder.html
kinder

// kindle : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/kindle.html
kindle

// kitchen : Binky Moon, LLC
// https://www.iana.org/domains/root/db/kitchen.html
kitchen

// kiwi : DOT KIWI LIMITED
// https://www.iana.org/domains/root/db/kiwi.html
kiwi

// koeln : dotKoeln GmbH
// https://www.iana.org/domains/root/db/koeln.html
koeln

// komatsu : Komatsu Ltd.
// https://www.iana.org/domains/root/db/komatsu.html
komatsu

// kosher : Kosher Marketing Assets LLC
// https://www.iana.org/domains/root/db/kosher.html
kosher

// kpmg : KPMG International Cooperative (KPMG International Genossenschaft)
// https://www.iana.org/domains/root/db/kpmg.html
kpmg

// kpn : Koninklijke KPN N.V.
// https://www.iana.org/domains/root/db/kpn.html
kpn

// krd : KRG Department of Information Technology
// https://www.iana.org/domains/root/db/krd.html
krd

// kred : KredTLD Pty Ltd
// https://www.iana.org/domains/root/db/kred.html
kred

// kuokgroup : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/kuokgroup.html
kuokgroup

// kyoto : Academic Institution: Kyoto Jyoho Gakuen
// https://www.iana.org/domains/root/db/kyoto.html
kyoto

// lacaixa : Fundación Bancaria Caixa d’Estalvis i Pensions de Barcelona, “la Caixa”
// https://www.iana.org/domains/root/db/lacaixa.html
lacaixa

// lamborghini : Automobili Lamborghini S.p.A.
// https://www.iana.org/domains/root/db/lamborghini.html
lamborghini

// lamer : The Estée Lauder Companies Inc.
// https://www.iana.org/domains/root/db/lamer.html
lamer

// lancaster : LANCASTER
// https://www.iana.org/domains/root/db/lancaster.html
lancaster

// land : Binky Moon, LLC
// https://www.iana.org/domains/root/db/land.html
land

// landrover : Jaguar Land Rover Ltd
// https://www.iana.org/domains/root/db/landrover.html
landrover

// lanxess : LANXESS Corporation
// https://www.iana.org/domains/root/db/lanxess.html
lanxess

// lasalle : Jones Lang LaSalle Incorporated
// https://www.iana.org/domains/root/db/lasalle.html
lasalle

// lat : XYZ.COM LLC
// https://www.iana.org/domains/root/db/lat.html
lat

// latino : Dish DBS Corporation
// https://www.iana.org/domains/root/db/latino.html
latino

// latrobe : La Trobe University
// https://www.iana.org/domains/root/db/latrobe.html
latrobe

// law : Registry Services, LLC
// https://www.iana.org/domains/root/db/law.html
law

// lawyer : Dog Beach, LLC
// https://www.iana.org/domains/root/db/lawyer.html
lawyer

// lds : IRI Domain Management, LLC
// https://www.iana.org/domains/root/db/lds.html
lds

// lease : Binky Moon, LLC
// https://www.iana.org/domains/root/db/lease.html
lease

// leclerc : A.C.D. LEC Association des Centres Distributeurs Edouard Leclerc
// https://www.iana.org/domains/root/db/leclerc.html
leclerc

// lefrak : LeFrak Organization, Inc.
// https://www.iana.org/domains/root/db/lefrak.html
lefrak

// legal : Binky Moon, LLC
// https://www.iana.org/domains/root/db/legal.html
legal

// lego : LEGO Juris A/S
// https://www.iana.org/domains/root/db/lego.html
lego

// lexus : TOYOTA MOTOR CORPORATION
// https://www.iana.org/domains/root/db/lexus.html
lexus

// lgbt : Identity Digital Limited
// https://www.iana.org/domains/root/db/lgbt.html
lgbt

// lidl : Schwarz Domains und Services GmbH & Co. KG
// https://www.iana.org/domains/root/db/lidl.html
lidl

// life : Binky Moon, LLC
// https://www.iana.org/domains/root/db/life.html
life

// lifeinsurance : American Council of Life Insurers
// https://www.iana.org/domains/root/db/lifeinsurance.html
lifeinsurance

// lifestyle : Lifestyle Domain Holdings, Inc.
// https://www.iana.org/domains/root/db/lifestyle.html
lifestyle

// lighting : Binky Moon, LLC
// https://www.iana.org/domains/root/db/lighting.html
lighting

// like : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/like.html
like

// lilly : Eli Lilly and Company
// https://www.iana.org/domains/root/db/lilly.html
lilly

// limited : Binky Moon, LLC
// https://www.iana.org/domains/root/db/limited.html
limited

// limo : Binky Moon, LLC
// https://www.iana.org/domains/root/db/limo.html
limo

// lincoln : Ford Motor Company
// https://www.iana.org/domains/root/db/lincoln.html
lincoln

// link : Nova Registry Ltd
// https://www.iana.org/domains/root/db/link.html
link

// lipsy : Lipsy Ltd
// https://www.iana.org/domains/root/db/lipsy.html
lipsy

// live : Dog Beach, LLC
// https://www.iana.org/domains/root/db/live.html
live

// living : Lifestyle Domain Holdings, Inc.
// https://www.iana.org/domains/root/db/living.html
living

// llc : Identity Digital Limited
// https://www.iana.org/domains/root/db/llc.html
llc

// llp : Intercap Registry Inc.
// https://www.iana.org/domains/root/db/llp.html
llp

// loan : dot Loan Limited
// https://www.iana.org/domains/root/db/loan.html
loan

// loans : Binky Moon, LLC
// https://www.iana.org/domains/root/db/loans.html
loans

// locker : Orange Domains LLC
// https://www.iana.org/domains/root/db/locker.html
locker

// locus : Locus Analytics LLC
// https://www.iana.org/domains/root/db/locus.html
locus

// lol : XYZ.COM LLC
// https://www.iana.org/domains/root/db/lol.html
lol

// london : Dot London Domains Limited
// https://www.iana.org/domains/root/db/london.html
london

// lotte : Lotte Holdings Co., Ltd.
// https://www.iana.org/domains/root/db/lotte.html
lotte

// lotto : Identity Digital Limited
// https://www.iana.org/domains/root/db/lotto.html
lotto

// love : Merchant Law Group LLP
// https://www.iana.org/domains/root/db/love.html
love

// lpl : LPL Holdings, Inc.
// https://www.iana.org/domains/root/db/lpl.html
lpl

// lplfinancial : LPL Holdings, Inc.
// https://www.iana.org/domains/root/db/lplfinancial.html
lplfinancial

// ltd : Binky Moon, LLC
// https://www.iana.org/domains/root/db/ltd.html
ltd

// ltda : InterNetX, Corp
// https://www.iana.org/domains/root/db/ltda.html
ltda

// lundbeck : H. Lundbeck A/S
// https://www.iana.org/domains/root/db/lundbeck.html
lundbeck

// luxe : Registry Services, LLC
// https://www.iana.org/domains/root/db/luxe.html
luxe

// luxury : Luxury Partners, LLC
// https://www.iana.org/domains/root/db/luxury.html
luxury

// madrid : Comunidad de Madrid
// https://www.iana.org/domains/root/db/madrid.html
madrid

// maif : Mutuelle Assurance Instituteur France (MAIF)
// https://www.iana.org/domains/root/db/maif.html
maif

// maison : Binky Moon, LLC
// https://www.iana.org/domains/root/db/maison.html
maison

// makeup : XYZ.COM LLC
// https://www.iana.org/domains/root/db/makeup.html
makeup

// man : MAN SE
// https://www.iana.org/domains/root/db/man.html
man

// management : Binky Moon, LLC
// https://www.iana.org/domains/root/db/management.html
management

// mango : PUNTO FA S.L.
// https://www.iana.org/domains/root/db/mango.html
mango

// map : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/map.html
map

// market : Dog Beach, LLC
// https://www.iana.org/domains/root/db/market.html
market

// marketing : Binky Moon, LLC
// https://www.iana.org/domains/root/db/marketing.html
marketing

// markets : Dog Beach, LLC
// https://www.iana.org/domains/root/db/markets.html
markets

// marriott : Marriott Worldwide Corporation
// https://www.iana.org/domains/root/db/marriott.html
marriott

// marshalls : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/marshalls.html
marshalls

// mattel : Mattel Sites, Inc.
// https://www.iana.org/domains/root/db/mattel.html
mattel

// mba : Binky Moon, LLC
// https://www.iana.org/domains/root/db/mba.html
mba

// mckinsey : McKinsey Holdings, Inc.
// https://www.iana.org/domains/root/db/mckinsey.html
mckinsey

// med : Medistry LLC
// https://www.iana.org/domains/root/db/med.html
med

// media : Binky Moon, LLC
// https://www.iana.org/domains/root/db/media.html
media

// meet : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/meet.html
meet

// melbourne : The Crown in right of the State of Victoria, represented by its Department of State Development, Business and Innovation
// https://www.iana.org/domains/root/db/melbourne.html
melbourne

// meme : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/meme.html
meme

// memorial : Dog Beach, LLC
// https://www.iana.org/domains/root/db/memorial.html
memorial

// men : Exclusive Registry Limited
// https://www.iana.org/domains/root/db/men.html
men

// menu : Dot Menu Registry, LLC
// https://www.iana.org/domains/root/db/menu.html
menu

// merckmsd : MSD Registry Holdings, Inc.
// https://www.iana.org/domains/root/db/merckmsd.html
merckmsd

// miami : Registry Services, LLC
// https://www.iana.org/domains/root/db/miami.html
miami

// microsoft : Microsoft Corporation
// https://www.iana.org/domains/root/db/microsoft.html
microsoft

// mini : Bayerische Motoren Werke Aktiengesellschaft
// https://www.iana.org/domains/root/db/mini.html
mini

// mint : Intuit Administrative Services, Inc.
// https://www.iana.org/domains/root/db/mint.html
mint

// mit : Massachusetts Institute of Technology
// https://www.iana.org/domains/root/db/mit.html
mit

// mitsubishi : Mitsubishi Corporation
// https://www.iana.org/domains/root/db/mitsubishi.html
mitsubishi

// mlb : MLB Advanced Media DH, LLC
// https://www.iana.org/domains/root/db/mlb.html
mlb

// mls : The Canadian Real Estate Association
// https://www.iana.org/domains/root/db/mls.html
mls

// mma : MMA IARD
// https://www.iana.org/domains/root/db/mma.html
mma

// mobile : Dish DBS Corporation
// https://www.iana.org/domains/root/db/mobile.html
mobile

// moda : Dog Beach, LLC
// https://www.iana.org/domains/root/db/moda.html
moda

// moe : Interlink Systems Innovation Institute K.K.
// https://www.iana.org/domains/root/db/moe.html
moe

// moi : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/moi.html
moi

// mom : XYZ.COM LLC
// https://www.iana.org/domains/root/db/mom.html
mom

// monash : Monash University
// https://www.iana.org/domains/root/db/monash.html
monash

// money : Binky Moon, LLC
// https://www.iana.org/domains/root/db/money.html
money

// monster : XYZ.COM LLC
// https://www.iana.org/domains/root/db/monster.html
monster

// mormon : IRI Domain Management, LLC
// https://www.iana.org/domains/root/db/mormon.html
mormon

// mortgage : Dog Beach, LLC
// https://www.iana.org/domains/root/db/mortgage.html
mortgage

// moscow : Foundation for Assistance for Internet Technologies and Infrastructure Development (FAITID)
// https://www.iana.org/domains/root/db/moscow.html
moscow

// moto : Motorola Trademark Holdings, LLC
// https://www.iana.org/domains/root/db/moto.html
moto

// motorcycles : XYZ.COM LLC
// https://www.iana.org/domains/root/db/motorcycles.html
motorcycles

// mov : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/mov.html
mov

// movie : Binky Moon, LLC
// https://www.iana.org/domains/root/db/movie.html
movie

// msd : MSD Registry Holdings, Inc.
// https://www.iana.org/domains/root/db/msd.html
msd

// mtn : MTN Dubai Limited
// https://www.iana.org/domains/root/db/mtn.html
mtn

// mtr : MTR Corporation Limited
// https://www.iana.org/domains/root/db/mtr.html
mtr

// music : DotMusic Limited
// https://www.iana.org/domains/root/db/music.html
music

// nab : National Australia Bank Limited
// https://www.iana.org/domains/root/db/nab.html
nab

// nagoya : GMO Registry, Inc.
// https://www.iana.org/domains/root/db/nagoya.html
nagoya

// natura : NATURA COSMÉTICOS S.A.
// https://www.iana.org/domains/root/db/natura.html
natura

// navy : Dog Beach, LLC
// https://www.iana.org/domains/root/db/navy.html
navy

// nba : NBA REGISTRY, LLC
// https://www.iana.org/domains/root/db/nba.html
nba

// nec : NEC Corporation
// https://www.iana.org/domains/root/db/nec.html
nec

// netbank : COMMONWEALTH BANK OF AUSTRALIA
// https://www.iana.org/domains/root/db/netbank.html
netbank

// netflix : Netflix, Inc.
// https://www.iana.org/domains/root/db/netflix.html
netflix

// network : Binky Moon, LLC
// https://www.iana.org/domains/root/db/network.html
network

// neustar : NeuStar, Inc.
// https://www.iana.org/domains/root/db/neustar.html
neustar

// new : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/new.html
new

// news : Dog Beach, LLC
// https://www.iana.org/domains/root/db/news.html
news

// next : Next plc
// https://www.iana.org/domains/root/db/next.html
next

// nextdirect : Next plc
// https://www.iana.org/domains/root/db/nextdirect.html
nextdirect

// nexus : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/nexus.html
nexus

// nfl : NFL Reg Ops LLC
// https://www.iana.org/domains/root/db/nfl.html
nfl

// ngo : Public Interest Registry
// https://www.iana.org/domains/root/db/ngo.html
ngo

// nhk : Japan Broadcasting Corporation (NHK)
// https://www.iana.org/domains/root/db/nhk.html
nhk

// nico : DWANGO Co., Ltd.
// https://www.iana.org/domains/root/db/nico.html
nico

// nike : NIKE, Inc.
// https://www.iana.org/domains/root/db/nike.html
nike

// nikon : NIKON CORPORATION
// https://www.iana.org/domains/root/db/nikon.html
nikon

// ninja : Dog Beach, LLC
// https://www.iana.org/domains/root/db/ninja.html
ninja

// nissan : NISSAN MOTOR CO., LTD.
// https://www.iana.org/domains/root/db/nissan.html
nissan

// nissay : Nippon Life Insurance Company
// https://www.iana.org/domains/root/db/nissay.html
nissay

// nokia : Nokia Corporation
// https://www.iana.org/domains/root/db/nokia.html
nokia

// norton : NortonLifeLock Inc.
// https://www.iana.org/domains/root/db/norton.html
norton

// now : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/now.html
now

// nowruz : Asia Green IT System Bilgisayar San. ve Tic. Ltd. Sti.
// https://www.iana.org/domains/root/db/nowruz.html
nowruz

// nowtv : Starbucks (HK) Limited
// https://www.iana.org/domains/root/db/nowtv.html
nowtv

// nra : NRA Holdings Company, INC.
// https://www.iana.org/domains/root/db/nra.html
nra

// nrw : Minds + Machines GmbH
// https://www.iana.org/domains/root/db/nrw.html
nrw

// ntt : NIPPON TELEGRAPH AND TELEPHONE CORPORATION
// https://www.iana.org/domains/root/db/ntt.html
ntt

// nyc : The City of New York by and through the New York City Department of Information Technology & Telecommunications
// https://www.iana.org/domains/root/db/nyc.html
nyc

// obi : OBI Group Holding SE & Co. KGaA
// https://www.iana.org/domains/root/db/obi.html
obi

// observer : Fegistry, LLC
// https://www.iana.org/domains/root/db/observer.html
observer

// office : Microsoft Corporation
// https://www.iana.org/domains/root/db/office.html
office

// okinawa : BRregistry, Inc.
// https://www.iana.org/domains/root/db/okinawa.html
okinawa

// olayan : Competrol (Luxembourg) Sarl
// https://www.iana.org/domains/root/db/olayan.html
olayan

// olayangroup : Competrol (Luxembourg) Sarl
// https://www.iana.org/domains/root/db/olayangroup.html
olayangroup

// oldnavy : The Gap, Inc.
// https://www.iana.org/domains/root/db/oldnavy.html
oldnavy

// ollo : Dish DBS Corporation
// https://www.iana.org/domains/root/db/ollo.html
ollo

// omega : The Swatch Group Ltd
// https://www.iana.org/domains/root/db/omega.html
omega

// one : One.com A/S
// https://www.iana.org/domains/root/db/one.html
one

// ong : Public Interest Registry
// https://www.iana.org/domains/root/db/ong.html
ong

// onl : iRegistry GmbH
// https://www.iana.org/domains/root/db/onl.html
onl

// online : Radix FZC DMCC
// https://www.iana.org/domains/root/db/online.html
online

// ooo : INFIBEAM AVENUES LIMITED
// https://www.iana.org/domains/root/db/ooo.html
ooo

// open : American Express Travel Related Services Company, Inc.
// https://www.iana.org/domains/root/db/open.html
open

// oracle : Oracle Corporation
// https://www.iana.org/domains/root/db/oracle.html
oracle

// orange : Orange Brand Services Limited
// https://www.iana.org/domains/root/db/orange.html
orange

// organic : Identity Digital Limited
// https://www.iana.org/domains/root/db/organic.html
organic

// origins : The Estée Lauder Companies Inc.
// https://www.iana.org/domains/root/db/origins.html
origins

// osaka : Osaka Registry Co., Ltd.
// https://www.iana.org/domains/root/db/osaka.html
osaka

// otsuka : Otsuka Holdings Co., Ltd.
// https://www.iana.org/domains/root/db/otsuka.html
otsuka

// ott : Dish DBS Corporation
// https://www.iana.org/domains/root/db/ott.html
ott

// ovh : MédiaBC
// https://www.iana.org/domains/root/db/ovh.html
ovh

// page : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/page.html
page

// panasonic : Panasonic Holdings Corporation
// https://www.iana.org/domains/root/db/panasonic.html
panasonic

// paris : City of Paris
// https://www.iana.org/domains/root/db/paris.html
paris

// pars : Asia Green IT System Bilgisayar San. ve Tic. Ltd. Sti.
// https://www.iana.org/domains/root/db/pars.html
pars

// partners : Binky Moon, LLC
// https://www.iana.org/domains/root/db/partners.html
partners

// parts : Binky Moon, LLC
// https://www.iana.org/domains/root/db/parts.html
parts

// party : Blue Sky Registry Limited
// https://www.iana.org/domains/root/db/party.html
party

// pay : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/pay.html
pay

// pccw : PCCW Enterprises Limited
// https://www.iana.org/domains/root/db/pccw.html
pccw

// pet : Identity Digital Limited
// https://www.iana.org/domains/root/db/pet.html
pet

// pfizer : Pfizer Inc.
// https://www.iana.org/domains/root/db/pfizer.html
pfizer

// pharmacy : National Association of Boards of Pharmacy
// https://www.iana.org/domains/root/db/pharmacy.html
pharmacy

// phd : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/phd.html
phd

// philips : Koninklijke Philips N.V.
// https://www.iana.org/domains/root/db/philips.html
philips

// phone : Dish DBS Corporation
// https://www.iana.org/domains/root/db/phone.html
phone

// photo : Registry Services, LLC
// https://www.iana.org/domains/root/db/photo.html
photo

// photography : Binky Moon, LLC
// https://www.iana.org/domains/root/db/photography.html
photography

// photos : Binky Moon, LLC
// https://www.iana.org/domains/root/db/photos.html
photos

// physio : PhysBiz Pty Ltd
// https://www.iana.org/domains/root/db/physio.html
physio

// pics : XYZ.COM LLC
// https://www.iana.org/domains/root/db/pics.html
pics

// pictet : Pictet Europe S.A.
// https://www.iana.org/domains/root/db/pictet.html
pictet

// pictures : Binky Moon, LLC
// https://www.iana.org/domains/root/db/pictures.html
pictures

// pid : Top Level Spectrum, Inc.
// https://www.iana.org/domains/root/db/pid.html
pid

// pin : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/pin.html
pin

// ping : Ping Registry Provider, Inc.
// https://www.iana.org/domains/root/db/ping.html
ping

// pink : Identity Digital Limited
// https://www.iana.org/domains/root/db/pink.html
pink

// pioneer : Pioneer Corporation
// https://www.iana.org/domains/root/db/pioneer.html
pioneer

// pizza : Binky Moon, LLC
// https://www.iana.org/domains/root/db/pizza.html
pizza

// place : Binky Moon, LLC
// https://www.iana.org/domains/root/db/place.html
place

// play : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/play.html
play

// playstation : Sony Interactive Entertainment Inc.
// https://www.iana.org/domains/root/db/playstation.html
playstation

// plumbing : Binky Moon, LLC
// https://www.iana.org/domains/root/db/plumbing.html
plumbing

// plus : Binky Moon, LLC
// https://www.iana.org/domains/root/db/plus.html
plus

// pnc : PNC Domain Co., LLC
// https://www.iana.org/domains/root/db/pnc.html
pnc

// pohl : Deutsche Vermögensberatung Aktiengesellschaft DVAG
// https://www.iana.org/domains/root/db/pohl.html
pohl

// poker : Identity Digital Limited
// https://www.iana.org/domains/root/db/poker.html
poker

// politie : Politie Nederland
// https://www.iana.org/domains/root/db/politie.html
politie

// porn : ICM Registry PN LLC
// https://www.iana.org/domains/root/db/porn.html
porn

// pramerica : Prudential Financial, Inc.
// https://www.iana.org/domains/root/db/pramerica.html
pramerica

// praxi : Praxi S.p.A.
// https://www.iana.org/domains/root/db/praxi.html
praxi

// press : Radix FZC DMCC
// https://www.iana.org/domains/root/db/press.html
press

// prime : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/prime.html
prime

// prod : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/prod.html
prod

// productions : Binky Moon, LLC
// https://www.iana.org/domains/root/db/productions.html
productions

// prof : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/prof.html
prof

// progressive : Progressive Casualty Insurance Company
// https://www.iana.org/domains/root/db/progressive.html
progressive

// promo : Identity Digital Limited
// https://www.iana.org/domains/root/db/promo.html
promo

// properties : Binky Moon, LLC
// https://www.iana.org/domains/root/db/properties.html
properties

// property : Digital Property Infrastructure Limited
// https://www.iana.org/domains/root/db/property.html
property

// protection : XYZ.COM LLC
// https://www.iana.org/domains/root/db/protection.html
protection

// pru : Prudential Financial, Inc.
// https://www.iana.org/domains/root/db/pru.html
pru

// prudential : Prudential Financial, Inc.
// https://www.iana.org/domains/root/db/prudential.html
prudential

// pub : Dog Beach, LLC
// https://www.iana.org/domains/root/db/pub.html
pub

// pwc : PricewaterhouseCoopers LLP
// https://www.iana.org/domains/root/db/pwc.html
pwc

// qpon : dotQPON LLC
// https://www.iana.org/domains/root/db/qpon.html
qpon

// quebec : PointQuébec Inc
// https://www.iana.org/domains/root/db/quebec.html
quebec

// quest : XYZ.COM LLC
// https://www.iana.org/domains/root/db/quest.html
quest

// racing : Premier Registry Limited
// https://www.iana.org/domains/root/db/racing.html
racing

// radio : European Broadcasting Union (EBU)
// https://www.iana.org/domains/root/db/radio.html
radio

// read : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/read.html
read

// realestate : dotRealEstate LLC
// https://www.iana.org/domains/root/db/realestate.html
realestate

// realtor : Real Estate Domains LLC
// https://www.iana.org/domains/root/db/realtor.html
realtor

// realty : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/realty.html
realty

// recipes : Binky Moon, LLC
// https://www.iana.org/domains/root/db/recipes.html
recipes

// red : Identity Digital Limited
// https://www.iana.org/domains/root/db/red.html
red

// redstone : Redstone Haute Couture Co., Ltd.
// https://www.iana.org/domains/root/db/redstone.html
redstone

// redumbrella : Travelers TLD, LLC
// https://www.iana.org/domains/root/db/redumbrella.html
redumbrella

// rehab : Dog Beach, LLC
// https://www.iana.org/domains/root/db/rehab.html
rehab

// reise : Binky Moon, LLC
// https://www.iana.org/domains/root/db/reise.html
reise

// reisen : Binky Moon, LLC
// https://www.iana.org/domains/root/db/reisen.html
reisen

// reit : National Association of Real Estate Investment Trusts, Inc.
// https://www.iana.org/domains/root/db/reit.html
reit

// reliance : Reliance Industries Limited
// https://www.iana.org/domains/root/db/reliance.html
reliance

// ren : ZDNS International Limited
// https://www.iana.org/domains/root/db/ren.html
ren

// rent : XYZ.COM LLC
// https://www.iana.org/domains/root/db/rent.html
rent

// rentals : Binky Moon, LLC
// https://www.iana.org/domains/root/db/rentals.html
rentals

// repair : Binky Moon, LLC
// https://www.iana.org/domains/root/db/repair.html
repair

// report : Binky Moon, LLC
// https://www.iana.org/domains/root/db/report.html
report

// republican : Dog Beach, LLC
// https://www.iana.org/domains/root/db/republican.html
republican

// rest : Punto 2012 Sociedad Anonima Promotora de Inversion de Capital Variable
// https://www.iana.org/domains/root/db/rest.html
rest

// restaurant : Binky Moon, LLC
// https://www.iana.org/domains/root/db/restaurant.html
restaurant

// review : dot Review Limited
// https://www.iana.org/domains/root/db/review.html
review

// reviews : Dog Beach, LLC
// https://www.iana.org/domains/root/db/reviews.html
reviews

// rexroth : Robert Bosch GMBH
// https://www.iana.org/domains/root/db/rexroth.html
rexroth

// rich : iRegistry GmbH
// https://www.iana.org/domains/root/db/rich.html
rich

// richardli : Pacific Century Asset Management (HK) Limited
// https://www.iana.org/domains/root/db/richardli.html
richardli

// ricoh : Ricoh Company, Ltd.
// https://www.iana.org/domains/root/db/ricoh.html
ricoh

// ril : Reliance Industries Limited
// https://www.iana.org/domains/root/db/ril.html
ril

// rio : Empresa Municipal de Informática SA - IPLANRIO
// https://www.iana.org/domains/root/db/rio.html
rio

// rip : Dog Beach, LLC
// https://www.iana.org/domains/root/db/rip.html
rip

// rocher : Ferrero Trading Lux S.A.
// https://www.iana.org/domains/root/db/rocher.html
rocher

// rocks : Dog Beach, LLC
// https://www.iana.org/domains/root/db/rocks.html
rocks

// rodeo : Registry Services, LLC
// https://www.iana.org/domains/root/db/rodeo.html
rodeo

// rogers : Rogers Communications Canada Inc.
// https://www.iana.org/domains/root/db/rogers.html
rogers

// room : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/room.html
room

// rsvp : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/rsvp.html
rsvp

// rugby : World Rugby Strategic Developments Limited
// https://www.iana.org/domains/root/db/rugby.html
rugby

// ruhr : dotSaarland GmbH
// https://www.iana.org/domains/root/db/ruhr.html
ruhr

// run : Binky Moon, LLC
// https://www.iana.org/domains/root/db/run.html
run

// rwe : RWE AG
// https://www.iana.org/domains/root/db/rwe.html
rwe

// ryukyu : BRregistry, Inc.
// https://www.iana.org/domains/root/db/ryukyu.html
ryukyu

// saarland : dotSaarland GmbH
// https://www.iana.org/domains/root/db/saarland.html
saarland

// safe : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/safe.html
safe

// safety : Safety Registry Services, LLC.
// https://www.iana.org/domains/root/db/safety.html
safety

// sakura : SAKURA Internet Inc.
// https://www.iana.org/domains/root/db/sakura.html
sakura

// sale : Dog Beach, LLC
// https://www.iana.org/domains/root/db/sale.html
sale

// salon : Binky Moon, LLC
// https://www.iana.org/domains/root/db/salon.html
salon

// samsclub : Wal-Mart Stores, Inc.
// https://www.iana.org/domains/root/db/samsclub.html
samsclub

// samsung : SAMSUNG SDS CO., LTD
// https://www.iana.org/domains/root/db/samsung.html
samsung

// sandvik : Sandvik AB
// https://www.iana.org/domains/root/db/sandvik.html
sandvik

// sandvikcoromant : Sandvik AB
// https://www.iana.org/domains/root/db/sandvikcoromant.html
sandvikcoromant

// sanofi : Sanofi
// https://www.iana.org/domains/root/db/sanofi.html
sanofi

// sap : SAP AG
// https://www.iana.org/domains/root/db/sap.html
sap

// sarl : Binky Moon, LLC
// https://www.iana.org/domains/root/db/sarl.html
sarl

// sas : Research IP LLC
// https://www.iana.org/domains/root/db/sas.html
sas

// save : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/save.html
save

// saxo : Saxo Bank A/S
// https://www.iana.org/domains/root/db/saxo.html
saxo

// sbi : STATE BANK OF INDIA
// https://www.iana.org/domains/root/db/sbi.html
sbi

// sbs : ShortDot SA
// https://www.iana.org/domains/root/db/sbs.html
sbs

// sca : SVENSKA CELLULOSA AKTIEBOLAGET SCA (publ)
// https://www.iana.org/domains/root/db/sca.html
sca

// scb : The Siam Commercial Bank Public Company Limited ("SCB")
// https://www.iana.org/domains/root/db/scb.html
scb

// schaeffler : Schaeffler Technologies AG & Co. KG
// https://www.iana.org/domains/root/db/schaeffler.html
schaeffler

// schmidt : SCHMIDT GROUPE S.A.S.
// https://www.iana.org/domains/root/db/schmidt.html
schmidt

// scholarships : Scholarships.com, LLC
// https://www.iana.org/domains/root/db/scholarships.html
scholarships

// school : Binky Moon, LLC
// https://www.iana.org/domains/root/db/school.html
school

// schule : Binky Moon, LLC
// https://www.iana.org/domains/root/db/schule.html
schule

// schwarz : Schwarz Domains und Services GmbH & Co. KG
// https://www.iana.org/domains/root/db/schwarz.html
schwarz

// science : dot Science Limited
// https://www.iana.org/domains/root/db/science.html
science

// scot : Dot Scot Registry Limited
// https://www.iana.org/domains/root/db/scot.html
scot

// search : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/search.html
search

// seat : SEAT, S.A. (Sociedad Unipersonal)
// https://www.iana.org/domains/root/db/seat.html
seat

// secure : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/secure.html
secure

// security : XYZ.COM LLC
// https://www.iana.org/domains/root/db/security.html
security

// seek : Seek Limited
// https://www.iana.org/domains/root/db/seek.html
seek

// select : Registry Services, LLC
// https://www.iana.org/domains/root/db/select.html
select

// sener : Sener Ingeniería y Sistemas, S.A.
// https://www.iana.org/domains/root/db/sener.html
sener

// services : Binky Moon, LLC
// https://www.iana.org/domains/root/db/services.html
services

// seven : Seven West Media Ltd
// https://www.iana.org/domains/root/db/seven.html
seven

// sew : SEW-EURODRIVE GmbH & Co KG
// https://www.iana.org/domains/root/db/sew.html
sew

// sex : ICM Registry SX LLC
// https://www.iana.org/domains/root/db/sex.html
sex

// sexy : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/sexy.html
sexy

// sfr : Societe Francaise du Radiotelephone - SFR
// https://www.iana.org/domains/root/db/sfr.html
sfr

// shangrila : Shangri‐La International Hotel Management Limited
// https://www.iana.org/domains/root/db/shangrila.html
shangrila

// sharp : Sharp Corporation
// https://www.iana.org/domains/root/db/sharp.html
sharp

// shaw : Shaw Cablesystems G.P.
// https://www.iana.org/domains/root/db/shaw.html
shaw

// shell : Shell Information Technology International Inc
// https://www.iana.org/domains/root/db/shell.html
shell

// shia : Asia Green IT System Bilgisayar San. ve Tic. Ltd. Sti.
// https://www.iana.org/domains/root/db/shia.html
shia

// shiksha : Identity Digital Limited
// https://www.iana.org/domains/root/db/shiksha.html
shiksha

// shoes : Binky Moon, LLC
// https://www.iana.org/domains/root/db/shoes.html
shoes

// shop : GMO Registry, Inc.
// https://www.iana.org/domains/root/db/shop.html
shop

// shopping : Binky Moon, LLC
// https://www.iana.org/domains/root/db/shopping.html
shopping

// shouji : Beijing Qihu Keji Co., Ltd.
// https://www.iana.org/domains/root/db/shouji.html
shouji

// show : Binky Moon, LLC
// https://www.iana.org/domains/root/db/show.html
show

// showtime : CBS Domains Inc.
// https://www.iana.org/domains/root/db/showtime.html
showtime

// silk : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/silk.html
silk

// sina : Sina Corporation
// https://www.iana.org/domains/root/db/sina.html
sina

// singles : Binky Moon, LLC
// https://www.iana.org/domains/root/db/singles.html
singles

// site : Radix FZC DMCC
// https://www.iana.org/domains/root/db/site.html
site

// ski : Identity Digital Limited
// https://www.iana.org/domains/root/db/ski.html
ski

// skin : XYZ.COM LLC
// https://www.iana.org/domains/root/db/skin.html
skin

// sky : Sky International AG
// https://www.iana.org/domains/root/db/sky.html
sky

// skype : Microsoft Corporation
// https://www.iana.org/domains/root/db/skype.html
skype

// sling : DISH Technologies L.L.C.
// https://www.iana.org/domains/root/db/sling.html
sling

// smart : Smart Communications, Inc. (SMART)
// https://www.iana.org/domains/root/db/smart.html
smart

// smile : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/smile.html
smile

// sncf : Société Nationale SNCF
// https://www.iana.org/domains/root/db/sncf.html
sncf

// soccer : Binky Moon, LLC
// https://www.iana.org/domains/root/db/soccer.html
soccer

// social : Dog Beach, LLC
// https://www.iana.org/domains/root/db/social.html
social

// softbank : SoftBank Group Corp.
// https://www.iana.org/domains/root/db/softbank.html
softbank

// software : Dog Beach, LLC
// https://www.iana.org/domains/root/db/software.html
software

// sohu : Sohu.com Limited
// https://www.iana.org/domains/root/db/sohu.html
sohu

// solar : Binky Moon, LLC
// https://www.iana.org/domains/root/db/solar.html
solar

// solutions : Binky Moon, LLC
// https://www.iana.org/domains/root/db/solutions.html
solutions

// song : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/song.html
song

// sony : Sony Corporation
// https://www.iana.org/domains/root/db/sony.html
sony

// soy : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/soy.html
soy

// spa : Asia Spa and Wellness Promotion Council Limited
// https://www.iana.org/domains/root/db/spa.html
spa

// space : Radix FZC DMCC
// https://www.iana.org/domains/root/db/space.html
space

// sport : SportAccord
// https://www.iana.org/domains/root/db/sport.html
sport

// spot : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/spot.html
spot

// srl : InterNetX, Corp
// https://www.iana.org/domains/root/db/srl.html
srl

// stada : STADA Arzneimittel AG
// https://www.iana.org/domains/root/db/stada.html
stada

// staples : Staples, Inc.
// https://www.iana.org/domains/root/db/staples.html
staples

// star : Star India Private Limited
// https://www.iana.org/domains/root/db/star.html
star

// statebank : STATE BANK OF INDIA
// https://www.iana.org/domains/root/db/statebank.html
statebank

// statefarm : State Farm Mutual Automobile Insurance Company
// https://www.iana.org/domains/root/db/statefarm.html
statefarm

// stc : Saudi Telecom Company
// https://www.iana.org/domains/root/db/stc.html
stc

// stcgroup : Saudi Telecom Company
// https://www.iana.org/domains/root/db/stcgroup.html
stcgroup

// stockholm : Stockholms kommun
// https://www.iana.org/domains/root/db/stockholm.html
stockholm

// storage : XYZ.COM LLC
// https://www.iana.org/domains/root/db/storage.html
storage

// store : Radix FZC DMCC
// https://www.iana.org/domains/root/db/store.html
store

// stream : dot Stream Limited
// https://www.iana.org/domains/root/db/stream.html
stream

// studio : Dog Beach, LLC
// https://www.iana.org/domains/root/db/studio.html
studio

// study : Registry Services, LLC
// https://www.iana.org/domains/root/db/study.html
study

// style : Binky Moon, LLC
// https://www.iana.org/domains/root/db/style.html
style

// sucks : Vox Populi Registry Ltd.
// https://www.iana.org/domains/root/db/sucks.html
sucks

// supplies : Binky Moon, LLC
// https://www.iana.org/domains/root/db/supplies.html
supplies

// supply : Binky Moon, LLC
// https://www.iana.org/domains/root/db/supply.html
supply

// support : Binky Moon, LLC
// https://www.iana.org/domains/root/db/support.html
support

// surf : Registry Services, LLC
// https://www.iana.org/domains/root/db/surf.html
surf

// surgery : Binky Moon, LLC
// https://www.iana.org/domains/root/db/surgery.html
surgery

// suzuki : SUZUKI MOTOR CORPORATION
// https://www.iana.org/domains/root/db/suzuki.html
suzuki

// swatch : The Swatch Group Ltd
// https://www.iana.org/domains/root/db/swatch.html
swatch

// swiss : Swiss Confederation
// https://www.iana.org/domains/root/db/swiss.html
swiss

// sydney : State of New South Wales, Department of Premier and Cabinet
// https://www.iana.org/domains/root/db/sydney.html
sydney

// systems : Binky Moon, LLC
// https://www.iana.org/domains/root/db/systems.html
systems

// tab : Tabcorp Holdings Limited
// https://www.iana.org/domains/root/db/tab.html
tab

// taipei : Taipei City Government
// https://www.iana.org/domains/root/db/taipei.html
taipei

// talk : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/talk.html
talk

// taobao : Alibaba Group Holding Limited
// https://www.iana.org/domains/root/db/taobao.html
taobao

// target : Target Domain Holdings, LLC
// https://www.iana.org/domains/root/db/target.html
target

// tatamotors : Tata Motors Ltd
// https://www.iana.org/domains/root/db/tatamotors.html
tatamotors

// tatar : Limited Liability Company "Coordination Center of Regional Domain of Tatarstan Republic"
// https://www.iana.org/domains/root/db/tatar.html
tatar

// tattoo : Registry Services, LLC
// https://www.iana.org/domains/root/db/tattoo.html
tattoo

// tax : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tax.html
tax

// taxi : Binky Moon, LLC
// https://www.iana.org/domains/root/db/taxi.html
taxi

// tci : Asia Green IT System Bilgisayar San. ve Tic. Ltd. Sti.
// https://www.iana.org/domains/root/db/tci.html
tci

// tdk : TDK Corporation
// https://www.iana.org/domains/root/db/tdk.html
tdk

// team : Binky Moon, LLC
// https://www.iana.org/domains/root/db/team.html
team

// tech : Radix FZC DMCC
// https://www.iana.org/domains/root/db/tech.html
tech

// technology : Binky Moon, LLC
// https://www.iana.org/domains/root/db/technology.html
technology

// temasek : Temasek Holdings (Private) Limited
// https://www.iana.org/domains/root/db/temasek.html
temasek

// tennis : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tennis.html
tennis

// teva : Teva Pharmaceutical Industries Limited
// https://www.iana.org/domains/root/db/teva.html
teva

// thd : Home Depot Product Authority, LLC
// https://www.iana.org/domains/root/db/thd.html
thd

// theater : Binky Moon, LLC
// https://www.iana.org/domains/root/db/theater.html
theater

// theatre : XYZ.COM LLC
// https://www.iana.org/domains/root/db/theatre.html
theatre

// tiaa : Teachers Insurance and Annuity Association of America
// https://www.iana.org/domains/root/db/tiaa.html
tiaa

// tickets : XYZ.COM LLC
// https://www.iana.org/domains/root/db/tickets.html
tickets

// tienda : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tienda.html
tienda

// tips : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tips.html
tips

// tires : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tires.html
tires

// tirol : punkt Tirol GmbH
// https://www.iana.org/domains/root/db/tirol.html
tirol

// tjmaxx : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/tjmaxx.html
tjmaxx

// tjx : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/tjx.html
tjx

// tkmaxx : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/tkmaxx.html
tkmaxx

// tmall : Alibaba Group Holding Limited
// https://www.iana.org/domains/root/db/tmall.html
tmall

// today : Binky Moon, LLC
// https://www.iana.org/domains/root/db/today.html
today

// tokyo : GMO Registry, Inc.
// https://www.iana.org/domains/root/db/tokyo.html
tokyo

// tools : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tools.html
tools

// top : .TOP Registry
// https://www.iana.org/domains/root/db/top.html
top

// toray : Toray Industries, Inc.
// https://www.iana.org/domains/root/db/toray.html
toray

// toshiba : TOSHIBA Corporation
// https://www.iana.org/domains/root/db/toshiba.html
toshiba

// total : TotalEnergies SE
// https://www.iana.org/domains/root/db/total.html
total

// tours : Binky Moon, LLC
// https://www.iana.org/domains/root/db/tours.html
tours

// town : Binky Moon, LLC
// https://www.iana.org/domains/root/db/town.html
town

// toyota : TOYOTA MOTOR CORPORATION
// https://www.iana.org/domains/root/db/toyota.html
toyota

// toys : Binky Moon, LLC
// https://www.iana.org/domains/root/db/toys.html
toys

// trade : Elite Registry Limited
// https://www.iana.org/domains/root/db/trade.html
trade

// trading : Dog Beach, LLC
// https://www.iana.org/domains/root/db/trading.html
trading

// training : Binky Moon, LLC
// https://www.iana.org/domains/root/db/training.html
training

// travel : Dog Beach, LLC
// https://www.iana.org/domains/root/db/travel.html
travel

// travelers : Travelers TLD, LLC
// https://www.iana.org/domains/root/db/travelers.html
travelers

// travelersinsurance : Travelers TLD, LLC
// https://www.iana.org/domains/root/db/travelersinsurance.html
travelersinsurance

// trust : Internet Naming Company LLC
// https://www.iana.org/domains/root/db/trust.html
trust

// trv : Travelers TLD, LLC
// https://www.iana.org/domains/root/db/trv.html
trv

// tube : Latin American Telecom LLC
// https://www.iana.org/domains/root/db/tube.html
tube

// tui : TUI AG
// https://www.iana.org/domains/root/db/tui.html
tui

// tunes : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/tunes.html
tunes

// tushu : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/tushu.html
tushu

// tvs : T V SUNDRAM IYENGAR  & SONS LIMITED
// https://www.iana.org/domains/root/db/tvs.html
tvs

// ubank : National Australia Bank Limited
// https://www.iana.org/domains/root/db/ubank.html
ubank

// ubs : UBS AG
// https://www.iana.org/domains/root/db/ubs.html
ubs

// unicom : China United Network Communications Corporation Limited
// https://www.iana.org/domains/root/db/unicom.html
unicom

// university : Binky Moon, LLC
// https://www.iana.org/domains/root/db/university.html
university

// uno : Radix FZC DMCC
// https://www.iana.org/domains/root/db/uno.html
uno

// uol : UBN INTERNET LTDA.
// https://www.iana.org/domains/root/db/uol.html
uol

// ups : UPS Market Driver, Inc.
// https://www.iana.org/domains/root/db/ups.html
ups

// vacations : Binky Moon, LLC
// https://www.iana.org/domains/root/db/vacations.html
vacations

// vana : Lifestyle Domain Holdings, Inc.
// https://www.iana.org/domains/root/db/vana.html
vana

// vanguard : The Vanguard Group, Inc.
// https://www.iana.org/domains/root/db/vanguard.html
vanguard

// vegas : Dot Vegas, Inc.
// https://www.iana.org/domains/root/db/vegas.html
vegas

// ventures : Binky Moon, LLC
// https://www.iana.org/domains/root/db/ventures.html
ventures

// verisign : VeriSign, Inc.
// https://www.iana.org/domains/root/db/verisign.html
verisign

// versicherung : tldbox GmbH
// https://www.iana.org/domains/root/db/versicherung.html
versicherung

// vet : Dog Beach, LLC
// https://www.iana.org/domains/root/db/vet.html
vet

// viajes : Binky Moon, LLC
// https://www.iana.org/domains/root/db/viajes.html
viajes

// video : Dog Beach, LLC
// https://www.iana.org/domains/root/db/video.html
video

// vig : VIENNA INSURANCE GROUP AG Wiener Versicherung Gruppe
// https://www.iana.org/domains/root/db/vig.html
vig

// viking : Viking River Cruises (Bermuda) Ltd.
// https://www.iana.org/domains/root/db/viking.html
viking

// villas : Binky Moon, LLC
// https://www.iana.org/domains/root/db/villas.html
villas

// vin : Binky Moon, LLC
// https://www.iana.org/domains/root/db/vin.html
vin

// vip : Registry Services, LLC
// https://www.iana.org/domains/root/db/vip.html
vip

// virgin : Virgin Enterprises Limited
// https://www.iana.org/domains/root/db/virgin.html
virgin

// visa : Visa Worldwide Pte. Limited
// https://www.iana.org/domains/root/db/visa.html
visa

// vision : Binky Moon, LLC
// https://www.iana.org/domains/root/db/vision.html
vision

// viva : Saudi Telecom Company
// https://www.iana.org/domains/root/db/viva.html
viva

// vivo : Telefonica Brasil S.A.
// https://www.iana.org/domains/root/db/vivo.html
vivo

// vlaanderen : DNS.be vzw
// https://www.iana.org/domains/root/db/vlaanderen.html
vlaanderen

// vodka : Registry Services, LLC
// https://www.iana.org/domains/root/db/vodka.html
vodka

// volkswagen : Volkswagen Group of America Inc.
// https://www.iana.org/domains/root/db/volkswagen.html
volkswagen

// volvo : Volvo Holding Sverige Aktiebolag
// https://www.iana.org/domains/root/db/volvo.html
volvo

// vote : Monolith Registry LLC
// https://www.iana.org/domains/root/db/vote.html
vote

// voting : Valuetainment Corp.
// https://www.iana.org/domains/root/db/voting.html
voting

// voto : Monolith Registry LLC
// https://www.iana.org/domains/root/db/voto.html
voto

// voyage : Binky Moon, LLC
// https://www.iana.org/domains/root/db/voyage.html
voyage

// wales : Nominet UK
// https://www.iana.org/domains/root/db/wales.html
wales

// walmart : Wal-Mart Stores, Inc.
// https://www.iana.org/domains/root/db/walmart.html
walmart

// walter : Sandvik AB
// https://www.iana.org/domains/root/db/walter.html
walter

// wang : Zodiac Wang Limited
// https://www.iana.org/domains/root/db/wang.html
wang

// wanggou : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/wanggou.html
wanggou

// watch : Binky Moon, LLC
// https://www.iana.org/domains/root/db/watch.html
watch

// watches : Identity Digital Limited
// https://www.iana.org/domains/root/db/watches.html
watches

// weather : International Business Machines Corporation
// https://www.iana.org/domains/root/db/weather.html
weather

// weatherchannel : International Business Machines Corporation
// https://www.iana.org/domains/root/db/weatherchannel.html
weatherchannel

// webcam : dot Webcam Limited
// https://www.iana.org/domains/root/db/webcam.html
webcam

// weber : Saint-Gobain Weber SA
// https://www.iana.org/domains/root/db/weber.html
weber

// website : Radix FZC DMCC
// https://www.iana.org/domains/root/db/website.html
website

// wedding : Registry Services, LLC
// https://www.iana.org/domains/root/db/wedding.html
wedding

// weibo : Sina Corporation
// https://www.iana.org/domains/root/db/weibo.html
weibo

// weir : Weir Group IP Limited
// https://www.iana.org/domains/root/db/weir.html
weir

// whoswho : Who's Who Registry
// https://www.iana.org/domains/root/db/whoswho.html
whoswho

// wien : punkt.wien GmbH
// https://www.iana.org/domains/root/db/wien.html
wien

// wiki : Registry Services, LLC
// https://www.iana.org/domains/root/db/wiki.html
wiki

// williamhill : William Hill Organization Limited
// https://www.iana.org/domains/root/db/williamhill.html
williamhill

// win : First Registry Limited
// https://www.iana.org/domains/root/db/win.html
win

// windows : Microsoft Corporation
// https://www.iana.org/domains/root/db/windows.html
windows

// wine : Binky Moon, LLC
// https://www.iana.org/domains/root/db/wine.html
wine

// winners : The TJX Companies, Inc.
// https://www.iana.org/domains/root/db/winners.html
winners

// wme : William Morris Endeavor Entertainment, LLC
// https://www.iana.org/domains/root/db/wme.html
wme

// wolterskluwer : Wolters Kluwer N.V.
// https://www.iana.org/domains/root/db/wolterskluwer.html
wolterskluwer

// woodside : Woodside Petroleum Limited
// https://www.iana.org/domains/root/db/woodside.html
woodside

// work : Registry Services, LLC
// https://www.iana.org/domains/root/db/work.html
work

// works : Binky Moon, LLC
// https://www.iana.org/domains/root/db/works.html
works

// world : Binky Moon, LLC
// https://www.iana.org/domains/root/db/world.html
world

// wow : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/wow.html
wow

// wtc : World Trade Centers Association, Inc.
// https://www.iana.org/domains/root/db/wtc.html
wtc

// wtf : Binky Moon, LLC
// https://www.iana.org/domains/root/db/wtf.html
wtf

// xbox : Microsoft Corporation
// https://www.iana.org/domains/root/db/xbox.html
xbox

// xerox : Xerox DNHC LLC
// https://www.iana.org/domains/root/db/xerox.html
xerox

// xfinity : Comcast IP Holdings I, LLC
// https://www.iana.org/domains/root/db/xfinity.html
xfinity

// xihuan : Beijing Qihu Keji Co., Ltd.
// https://www.iana.org/domains/root/db/xihuan.html
xihuan

// xin : Elegant Leader Limited
// https://www.iana.org/domains/root/db/xin.html
xin

// xn--11b4c3d : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--11b4c3d.html
कॉम

// xn--1ck2e1b : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--1ck2e1b.html
セール

// xn--1qqw23a : Guangzhou YU Wei Information Technology Co., Ltd.
// https://www.iana.org/domains/root/db/xn--1qqw23a.html
佛山

// xn--30rr7y : Excellent First Limited
// https://www.iana.org/domains/root/db/xn--30rr7y.html
慈善

// xn--3bst00m : Eagle Horizon Limited
// https://www.iana.org/domains/root/db/xn--3bst00m.html
集团

// xn--3ds443g : TLD REGISTRY LIMITED OY
// https://www.iana.org/domains/root/db/xn--3ds443g.html
在线

// xn--3pxu8k : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--3pxu8k.html
点看

// xn--42c2d9a : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--42c2d9a.html
คอม

// xn--45q11c : Zodiac Gemini Ltd
// https://www.iana.org/domains/root/db/xn--45q11c.html
八卦

// xn--4gbrim : Helium TLDs Ltd
// https://www.iana.org/domains/root/db/xn--4gbrim.html
موقع

// xn--55qw42g : China Organizational Name Administration Center
// https://www.iana.org/domains/root/db/xn--55qw42g.html
公益

// xn--55qx5d : China Internet Network Information Center (CNNIC)
// https://www.iana.org/domains/root/db/xn--55qx5d.html
公司

// xn--5su34j936bgsg : Shangri‐La International Hotel Management Limited
// https://www.iana.org/domains/root/db/xn--5su34j936bgsg.html
香格里拉

// xn--5tzm5g : Global Website TLD Asia Limited
// https://www.iana.org/domains/root/db/xn--5tzm5g.html
网站

// xn--6frz82g : Identity Digital Limited
// https://www.iana.org/domains/root/db/xn--6frz82g.html
移动

// xn--6qq986b3xl : Tycoon Treasure Limited
// https://www.iana.org/domains/root/db/xn--6qq986b3xl.html
我爱你

// xn--80adxhks : Foundation for Assistance for Internet Technologies and Infrastructure Development (FAITID)
// https://www.iana.org/domains/root/db/xn--80adxhks.html
москва

// xn--80aqecdr1a : Pontificium Consilium de Comunicationibus Socialibus (PCCS) (Pontifical Council for Social Communication)
// https://www.iana.org/domains/root/db/xn--80aqecdr1a.html
католик

// xn--80asehdb : CORE Association
// https://www.iana.org/domains/root/db/xn--80asehdb.html
онлайн

// xn--80aswg : CORE Association
// https://www.iana.org/domains/root/db/xn--80aswg.html
сайт

// xn--8y0a063a : China United Network Communications Corporation Limited
// https://www.iana.org/domains/root/db/xn--8y0a063a.html
联通

// xn--9dbq2a : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--9dbq2a.html
קום

// xn--9et52u : RISE VICTORY LIMITED
// https://www.iana.org/domains/root/db/xn--9et52u.html
时尚

// xn--9krt00a : Sina Corporation
// https://www.iana.org/domains/root/db/xn--9krt00a.html
微博

// xn--b4w605ferd : Temasek Holdings (Private) Limited
// https://www.iana.org/domains/root/db/xn--b4w605ferd.html
淡马锡

// xn--bck1b9a5dre4c : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--bck1b9a5dre4c.html
ファッション

// xn--c1avg : Public Interest Registry
// https://www.iana.org/domains/root/db/xn--c1avg.html
орг

// xn--c2br7g : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--c2br7g.html
नेट

// xn--cck2b3b : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--cck2b3b.html
ストア

// xn--cckwcxetd : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--cckwcxetd.html
アマゾン

// xn--cg4bki : SAMSUNG SDS CO., LTD
// https://www.iana.org/domains/root/db/xn--cg4bki.html
삼성

// xn--czr694b : Internet DotTrademark Organisation Limited
// https://www.iana.org/domains/root/db/xn--czr694b.html
商标

// xn--czrs0t : Binky Moon, LLC
// https://www.iana.org/domains/root/db/xn--czrs0t.html
商店

// xn--czru2d : Zodiac Aquarius Limited
// https://www.iana.org/domains/root/db/xn--czru2d.html
商城

// xn--d1acj3b : The Foundation for Network Initiatives “The Smart Internet”
// https://www.iana.org/domains/root/db/xn--d1acj3b.html
дети

// xn--eckvdtc9d : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--eckvdtc9d.html
ポイント

// xn--efvy88h : Guangzhou YU Wei Information Technology Co., Ltd.
// https://www.iana.org/domains/root/db/xn--efvy88h.html
新闻

// xn--fct429k : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--fct429k.html
家電

// xn--fhbei : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--fhbei.html
كوم

// xn--fiq228c5hs : TLD REGISTRY LIMITED OY
// https://www.iana.org/domains/root/db/xn--fiq228c5hs.html
中文网

// xn--fiq64b : CITIC Group Corporation
// https://www.iana.org/domains/root/db/xn--fiq64b.html
中信

// xn--fjq720a : Binky Moon, LLC
// https://www.iana.org/domains/root/db/xn--fjq720a.html
娱乐

// xn--flw351e : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/xn--flw351e.html
谷歌

// xn--fzys8d69uvgm : PCCW Enterprises Limited
// https://www.iana.org/domains/root/db/xn--fzys8d69uvgm.html
電訊盈科

// xn--g2xx48c : Nawang Heli(Xiamen) Network Service Co., LTD.
// https://www.iana.org/domains/root/db/xn--g2xx48c.html
购物

// xn--gckr3f0f : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--gckr3f0f.html
クラウド

// xn--gk3at1e : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--gk3at1e.html
通販

// xn--hxt814e : Zodiac Taurus Limited
// https://www.iana.org/domains/root/db/xn--hxt814e.html
网店

// xn--i1b6b1a6a2e : Public Interest Registry
// https://www.iana.org/domains/root/db/xn--i1b6b1a6a2e.html
संगठन

// xn--imr513n : Internet DotTrademark Organisation Limited
// https://www.iana.org/domains/root/db/xn--imr513n.html
餐厅

// xn--io0a7i : China Internet Network Information Center (CNNIC)
// https://www.iana.org/domains/root/db/xn--io0a7i.html
网络

// xn--j1aef : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--j1aef.html
ком

// xn--jlq480n2rg : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--jlq480n2rg.html
亚马逊

// xn--jvr189m : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--jvr189m.html
食品

// xn--kcrx77d1x4a : Koninklijke Philips N.V.
// https://www.iana.org/domains/root/db/xn--kcrx77d1x4a.html
飞利浦

// xn--kput3i : Beijing RITT-Net Technology Development Co., Ltd
// https://www.iana.org/domains/root/db/xn--kput3i.html
手机

// xn--mgba3a3ejt : Aramco Services Company
// https://www.iana.org/domains/root/db/xn--mgba3a3ejt.html
ارامكو

// xn--mgba7c0bbn0a : Competrol (Luxembourg) Sarl
// https://www.iana.org/domains/root/db/xn--mgba7c0bbn0a.html
العليان

// xn--mgbaakc7dvf : Emirates Telecommunications Corporation (trading as Etisalat)
// https://www.iana.org/domains/root/db/xn--mgbaakc7dvf.html
اتصالات

// xn--mgbab2bd : CORE Association
// https://www.iana.org/domains/root/db/xn--mgbab2bd.html
بازار

// xn--mgbca7dzdo : Abu Dhabi Systems and Information Centre
// https://www.iana.org/domains/root/db/xn--mgbca7dzdo.html
ابوظبي

// xn--mgbi4ecexp : Pontificium Consilium de Comunicationibus Socialibus (PCCS) (Pontifical Council for Social Communication)
// https://www.iana.org/domains/root/db/xn--mgbi4ecexp.html
كاثوليك

// xn--mgbt3dhd : Asia Green IT System Bilgisayar San. ve Tic. Ltd. Sti.
// https://www.iana.org/domains/root/db/xn--mgbt3dhd.html
همراه

// xn--mk1bu44c : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--mk1bu44c.html
닷컴

// xn--mxtq1m : Net-Chinese Co., Ltd.
// https://www.iana.org/domains/root/db/xn--mxtq1m.html
政府

// xn--ngbc5azd : International Domain Registry Pty. Ltd.
// https://www.iana.org/domains/root/db/xn--ngbc5azd.html
شبكة

// xn--ngbe9e0a : Kuwait Finance House
// https://www.iana.org/domains/root/db/xn--ngbe9e0a.html
بيتك

// xn--ngbrx : League of Arab States
// https://www.iana.org/domains/root/db/xn--ngbrx.html
عرب

// xn--nqv7f : Public Interest Registry
// https://www.iana.org/domains/root/db/xn--nqv7f.html
机构

// xn--nqv7fs00ema : Public Interest Registry
// https://www.iana.org/domains/root/db/xn--nqv7fs00ema.html
组织机构

// xn--nyqy26a : Stable Tone Limited
// https://www.iana.org/domains/root/db/xn--nyqy26a.html
健康

// xn--otu796d : Jiang Yu Liang Cai Technology Company Limited
// https://www.iana.org/domains/root/db/xn--otu796d.html
招聘

// xn--p1acf : Rusnames Limited
// https://www.iana.org/domains/root/db/xn--p1acf.html
рус

// xn--pssy2u : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--pssy2u.html
大拿

// xn--q9jyb4c : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/xn--q9jyb4c.html
みんな

// xn--qcka1pmc : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/xn--qcka1pmc.html
グーグル

// xn--rhqv96g : Stable Tone Limited
// https://www.iana.org/domains/root/db/xn--rhqv96g.html
世界

// xn--rovu88b : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/xn--rovu88b.html
書籍

// xn--ses554g : KNET Co., Ltd.
// https://www.iana.org/domains/root/db/xn--ses554g.html
网址

// xn--t60b56a : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--t60b56a.html
닷넷

// xn--tckwe : VeriSign Sarl
// https://www.iana.org/domains/root/db/xn--tckwe.html
コム

// xn--tiq49xqyj : Pontificium Consilium de Comunicationibus Socialibus (PCCS) (Pontifical Council for Social Communication)
// https://www.iana.org/domains/root/db/xn--tiq49xqyj.html
天主教

// xn--unup4y : Binky Moon, LLC
// https://www.iana.org/domains/root/db/xn--unup4y.html
游戏

// xn--vermgensberater-ctb : Deutsche Vermögensberatung Aktiengesellschaft DVAG
// https://www.iana.org/domains/root/db/xn--vermgensberater-ctb.html
vermögensberater

// xn--vermgensberatung-pwb : Deutsche Vermögensberatung Aktiengesellschaft DVAG
// https://www.iana.org/domains/root/db/xn--vermgensberatung-pwb.html
vermögensberatung

// xn--vhquv : Binky Moon, LLC
// https://www.iana.org/domains/root/db/xn--vhquv.html
企业

// xn--vuq861b : Beijing Tele-info Technology Co., Ltd.
// https://www.iana.org/domains/root/db/xn--vuq861b.html
信息

// xn--w4r85el8fhu5dnra : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/xn--w4r85el8fhu5dnra.html
嘉里大酒店

// xn--w4rs40l : Kerry Trading Co. Limited
// https://www.iana.org/domains/root/db/xn--w4rs40l.html
嘉里

// xn--xhq521b : Guangzhou YU Wei Information Technology Co., Ltd.
// https://www.iana.org/domains/root/db/xn--xhq521b.html
广东

// xn--zfr164b : China Organizational Name Administration Center
// https://www.iana.org/domains/root/db/xn--zfr164b.html
政务

// xyz : XYZ.COM LLC
// https://www.iana.org/domains/root/db/xyz.html
xyz

// yachts : XYZ.COM LLC
// https://www.iana.org/domains/root/db/yachts.html
yachts

// yahoo : Oath Inc.
// https://www.iana.org/domains/root/db/yahoo.html
yahoo

// yamaxun : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/yamaxun.html
yamaxun

// yandex : Yandex Europe B.V.
// https://www.iana.org/domains/root/db/yandex.html
yandex

// yodobashi : YODOBASHI CAMERA CO.,LTD.
// https://www.iana.org/domains/root/db/yodobashi.html
yodobashi

// yoga : Registry Services, LLC
// https://www.iana.org/domains/root/db/yoga.html
yoga

// yokohama : GMO Registry, Inc.
// https://www.iana.org/domains/root/db/yokohama.html
yokohama

// you : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/you.html
you

// youtube : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/youtube.html
youtube

// yun : Beijing Qihu Keji Co., Ltd.
// https://www.iana.org/domains/root/db/yun.html
yun

// zappos : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/zappos.html
zappos

// zara : Industria de Diseño Textil, S.A. (INDITEX, S.A.)
// https://www.iana.org/domains/root/db/zara.html
zara

// zero : Amazon Registry Services, Inc.
// https://www.iana.org/domains/root/db/zero.html
zero

// zip : Charleston Road Registry Inc.
// https://www.iana.org/domains/root/db/zip.html
zip

// zone : Binky Moon, LLC
// https://www.iana.org/domains/root/db/zone.html
zone

// zuerich : Kanton Zürich (Canton of Zurich)
// https://www.iana.org/domains/root/db/zuerich.html
zuerich


// ===END ICANN DOMAINS===
// ===BEGIN PRIVATE DOMAINS===
// (Note: these are in alphabetical order by company name)

// 1GB LLC : https://www.1gb.ua/
// Submitted by 1GB LLC <noc@1gb.com.ua>
cc.ua
inf.ua
ltd.ua

// 611coin : https://611project.org/
611.to

// Aaron Marais' Gitlab pages: https://lab.aaronleem.co.za
// Submitted by Aaron Marais <its_me@aaronleem.co.za>
graphox.us

// accesso Technology Group, plc. : https://accesso.com/
// Submitted by accesso Team <accessoecommerce@accesso.com>
*.devcdnaccesso.com

// Acorn Labs : https://acorn.io
// Submitted by Craig Jellick <domains@acorn.io>
*.on-acorn.io

// ActiveTrail: https://www.activetrail.biz/
// Submitted by Ofer Kalaora <postmaster@activetrail.com>
activetrail.biz

// Adobe : https://www.adobe.com/
// Submitted by Ian Boston <boston@adobe.com> and Lars Trieloff <trieloff@adobe.com>
adobeaemcloud.com
*.dev.adobeaemcloud.com
hlx.live
adobeaemcloud.net
hlx.page
hlx3.page

// Adobe Developer Platform : https://developer.adobe.com
// Submitted by Jesse MacFadyen<jessem@adobe.com>
adobeio-static.net
adobeioruntime.net

// Agnat sp. z o.o. : https://domena.pl
// Submitted by Przemyslaw Plewa <it-admin@domena.pl>
beep.pl

// Airkit : https://www.airkit.com/
// Submitted by Grant Cooksey <security@airkit.com>
airkitapps.com
airkitapps-au.com
airkitapps.eu

// Aiven: https://aiven.io/
// Submitted by Etienne Stalmans <security@aiven.io>
aivencloud.com

// Akamai : https://www.akamai.com/
// Submitted by Akamai Team <publicsuffixlist@akamai.com>
akadns.net
akamai.net
akamai-staging.net
akamaiedge.net
akamaiedge-staging.net
akamaihd.net
akamaihd-staging.net
akamaiorigin.net
akamaiorigin-staging.net
akamaized.net
akamaized-staging.net
edgekey.net
edgekey-staging.net
edgesuite.net
edgesuite-staging.net

// alboto.ca : http://alboto.ca
// Submitted by Anton Avramov <avramov@alboto.ca>
barsy.ca

// Alces Software Ltd : http://alces-software.com
// Submitted by Mark J. Titorenko <mark.titorenko@alces-software.com>
*.compute.estate
*.alces.network

// all-inkl.com : https://all-inkl.com
// Submitted by Werner Kaltofen <wk@all-inkl.com>
kasserver.com

// Altervista: https://www.altervista.org
// Submitted by Carlo Cannas <tech_staff@altervista.it>
altervista.org

// alwaysdata : https://www.alwaysdata.com
// Submitted by Cyril <admin@alwaysdata.com>
alwaysdata.net

// Amaze Software : https://amaze.co
// Submitted by Domain Admin <domainadmin@amaze.co>
myamaze.net

// Amazon : https://www.amazon.com/
// Submitted by AWS Security <psl-maintainers@amazon.com>
// Subsections of Amazon/subsidiaries will appear until "concludes" tag

// Amazon CloudFront
// Submitted by Donavan Miller <donavanm@amazon.com>
// Reference: 54144616-fd49-4435-8535-19c6a601bdb3
cloudfront.net

// Amazon EC2
// Submitted by Luke Wells <psl-maintainers@amazon.com>
// Reference: 4c38fa71-58ac-4768-99e5-689c1767e537
*.compute.amazonaws.com
*.compute-1.amazonaws.com
*.compute.amazonaws.com.cn
us-east-1.amazonaws.com

// Amazon S3
// Submitted by Luke Wells <psl-maintainers@amazon.com>
// Reference: d068bd97-f0a9-4838-a6d8-954b622ef4ae
s3.cn-north-1.amazonaws.com.cn
s3.dualstack.ap-northeast-1.amazonaws.com
s3.dualstack.ap-northeast-2.amazonaws.com
s3.ap-northeast-2.amazonaws.com
s3-website.ap-northeast-2.amazonaws.com
s3.dualstack.ap-south-1.amazonaws.com
s3.ap-south-1.amazonaws.com
s3-website.ap-south-1.amazonaws.com
s3.dualstack.ap-southeast-1.amazonaws.com
s3.dualstack.ap-southeast-2.amazonaws.com
s3.dualstack.ca-central-1.amazonaws.com
s3.ca-central-1.amazonaws.com
s3-website.ca-central-1.amazonaws.com
s3.dualstack.eu-central-1.amazonaws.com
s3.eu-central-1.amazonaws.com
s3-website.eu-central-1.amazonaws.com
s3.dualstack.eu-west-1.amazonaws.com
s3.dualstack.eu-west-2.amazonaws.com
s3.eu-west-2.amazonaws.com
s3-website.eu-west-2.amazonaws.com
s3.dualstack.eu-west-3.amazonaws.com
s3.eu-west-3.amazonaws.com
s3-website.eu-west-3.amazonaws.com
s3.amazonaws.com
s3-ap-northeast-1.amazonaws.com
s3-ap-northeast-2.amazonaws.com
s3-ap-south-1.amazonaws.com
s3-ap-southeast-1.amazonaws.com
s3-ap-southeast-2.amazonaws.com
s3-ca-central-1.amazonaws.com
s3-eu-central-1.amazonaws.com
s3-eu-west-1.amazonaws.com
s3-eu-west-2.amazonaws.com
s3-eu-west-3.amazonaws.com
s3-external-1.amazonaws.com
s3-fips-us-gov-west-1.amazonaws.com
s3-sa-east-1.amazonaws.com
s3-us-east-2.amazonaws.com
s3-us-gov-west-1.amazonaws.com
s3-us-west-1.amazonaws.com
s3-us-west-2.amazonaws.com
s3-website-ap-northeast-1.amazonaws.com
s3-website-ap-southeast-1.amazonaws.com
s3-website-ap-southeast-2.amazonaws.com
s3-website-eu-west-1.amazonaws.com
s3-website-sa-east-1.amazonaws.com
s3-website-us-east-1.amazonaws.com
s3-website-us-west-1.amazonaws.com
s3-website-us-west-2.amazonaws.com
s3.dualstack.sa-east-1.amazonaws.com
s3.dualstack.us-east-1.amazonaws.com
s3.dualstack.us-east-2.amazonaws.com
s3.us-east-2.amazonaws.com
s3-website.us-east-2.amazonaws.com

// Analytics on AWS
// Submitted by AWS Security <psl-maintainers@amazon.com>
// Reference: c02c3a80-f8a0-4fd2-b719-48ea8b7c28de
analytics-gateway.ap-northeast-1.amazonaws.com
analytics-gateway.eu-west-1.amazonaws.com
analytics-gateway.us-east-1.amazonaws.com
analytics-gateway.us-east-2.amazonaws.com
analytics-gateway.us-west-2.amazonaws.com

// AWS Cloud9
// Submitted by: AWS Security <psl-maintainers@amazon.com>
// Reference: 05c44955-977c-4b57-938a-f2af92733f9f
webview-assets.aws-cloud9.af-south-1.amazonaws.com
vfs.cloud9.af-south-1.amazonaws.com
webview-assets.cloud9.af-south-1.amazonaws.com
webview-assets.aws-cloud9.ap-east-1.amazonaws.com
vfs.cloud9.ap-east-1.amazonaws.com
webview-assets.cloud9.ap-east-1.amazonaws.com
webview-assets.aws-cloud9.ap-northeast-1.amazonaws.com
vfs.cloud9.ap-northeast-1.amazonaws.com
webview-assets.cloud9.ap-northeast-1.amazonaws.com
webview-assets.aws-cloud9.ap-northeast-2.amazonaws.com
vfs.cloud9.ap-northeast-2.amazonaws.com
webview-assets.cloud9.ap-northeast-2.amazonaws.com
webview-assets.aws-cloud9.ap-northeast-3.amazonaws.com
vfs.cloud9.ap-northeast-3.amazonaws.com
webview-assets.cloud9.ap-northeast-3.amazonaws.com
webview-assets.aws-cloud9.ap-south-1.amazonaws.com
vfs.cloud9.ap-south-1.amazonaws.com
webview-assets.cloud9.ap-south-1.amazonaws.com
webview-assets.aws-cloud9.ap-southeast-1.amazonaws.com
vfs.cloud9.ap-southeast-1.amazonaws.com
webview-assets.cloud9.ap-southeast-1.amazonaws.com
webview-assets.aws-cloud9.ap-southeast-2.amazonaws.com
vfs.cloud9.ap-southeast-2.amazonaws.com
webview-assets.cloud9.ap-southeast-2.amazonaws.com
webview-assets.aws-cloud9.ca-central-1.amazonaws.com
vfs.cloud9.ca-central-1.amazonaws.com
webview-assets.cloud9.ca-central-1.amazonaws.com
webview-assets.aws-cloud9.eu-central-1.amazonaws.com
vfs.cloud9.eu-central-1.amazonaws.com
webview-assets.cloud9.eu-central-1.amazonaws.com
webview-assets.aws-cloud9.eu-north-1.amazonaws.com
vfs.cloud9.eu-north-1.amazonaws.com
webview-assets.cloud9.eu-north-1.amazonaws.com
webview-assets.aws-cloud9.eu-south-1.amazonaws.com
vfs.cloud9.eu-south-1.amazonaws.com
webview-assets.cloud9.eu-south-1.amazonaws.com
webview-assets.aws-cloud9.eu-west-1.amazonaws.com
vfs.cloud9.eu-west-1.amazonaws.com
webview-assets.cloud9.eu-west-1.amazonaws.com
webview-assets.aws-cloud9.eu-west-2.amazonaws.com
vfs.cloud9.eu-west-2.amazonaws.com
webview-assets.cloud9.eu-west-2.amazonaws.com
webview-assets.aws-cloud9.eu-west-3.amazonaws.com
vfs.cloud9.eu-west-3.amazonaws.com
webview-assets.cloud9.eu-west-3.amazonaws.com
webview-assets.aws-cloud9.me-south-1.amazonaws.com
vfs.cloud9.me-south-1.amazonaws.com
webview-assets.cloud9.me-south-1.amazonaws.com
webview-assets.aws-cloud9.sa-east-1.amazonaws.com
vfs.cloud9.sa-east-1.amazonaws.com
webview-assets.cloud9.sa-east-1.amazonaws.com
webview-assets.aws-cloud9.us-east-1.amazonaws.com
vfs.cloud9.us-east-1.amazonaws.com
webview-assets.cloud9.us-east-1.amazonaws.com
webview-assets.aws-cloud9.us-east-2.amazonaws.com
vfs.cloud9.us-east-2.amazonaws.com
webview-assets.cloud9.us-east-2.amazonaws.com
webview-assets.aws-cloud9.us-west-1.amazonaws.com
vfs.cloud9.us-west-1.amazonaws.com
webview-assets.cloud9.us-west-1.amazonaws.com
webview-assets.aws-cloud9.us-west-2.amazonaws.com
vfs.cloud9.us-west-2.amazonaws.com
webview-assets.cloud9.us-west-2.amazonaws.com

// AWS Elastic Beanstalk
// Submitted by Luke Wells <psl-maintainers@amazon.com>
// Reference: aa202394-43a0-4857-b245-8db04549137e
cn-north-1.eb.amazonaws.com.cn
cn-northwest-1.eb.amazonaws.com.cn
elasticbeanstalk.com
ap-northeast-1.elasticbeanstalk.com
ap-northeast-2.elasticbeanstalk.com
ap-northeast-3.elasticbeanstalk.com
ap-south-1.elasticbeanstalk.com
ap-southeast-1.elasticbeanstalk.com
ap-southeast-2.elasticbeanstalk.com
ca-central-1.elasticbeanstalk.com
eu-central-1.elasticbeanstalk.com
eu-west-1.elasticbeanstalk.com
eu-west-2.elasticbeanstalk.com
eu-west-3.elasticbeanstalk.com
sa-east-1.elasticbeanstalk.com
us-east-1.elasticbeanstalk.com
us-east-2.elasticbeanstalk.com
us-gov-west-1.elasticbeanstalk.com
us-west-1.elasticbeanstalk.com
us-west-2.elasticbeanstalk.com

// (AWS) Elastic Load Balancing
// Submitted by Luke Wells <psl-maintainers@amazon.com>
// Reference: 12a3d528-1bac-4433-a359-a395867ffed2
*.elb.amazonaws.com.cn
*.elb.amazonaws.com

// AWS Global Accelerator
// Submitted by Daniel Massaguer <psl-maintainers@amazon.com>
// Reference: d916759d-a08b-4241-b536-4db887383a6a
awsglobalaccelerator.com

// eero
// Submitted by Yue Kang <eero-dynamic-dns@amazon.com>
// Reference: 264afe70-f62c-4c02-8ab9-b5281ed24461
eero.online
eero-stage.online

// concludes Amazon

// Amune : https://amune.org/
// Submitted by Team Amune <cert@amune.org>
t3l3p0rt.net
tele.amune.org

// Apigee : https://apigee.com/
// Submitted by Apigee Security Team <security@apigee.com>
apigee.io

// Apphud : https://apphud.com
// Submitted by Alexander Selivanov <alex@apphud.com>
siiites.com

// Appspace : https://www.appspace.com
// Submitted by Appspace Security Team <security@appspace.com>
appspacehosted.com
appspaceusercontent.com

// Appudo UG (haftungsbeschränkt) : https://www.appudo.com
// Submitted by Alexander Hochbaum <admin@appudo.com>
appudo.net

// Aptible : https://www.aptible.com/
// Submitted by Thomas Orozco <thomas@aptible.com>
on-aptible.com

// ASEINet : https://www.aseinet.com/
// Submitted by Asei SEKIGUCHI <mail@aseinet.com>
user.aseinet.ne.jp
gv.vc
d.gv.vc

// Asociación Amigos de la Informática "Euskalamiga" : http://encounter.eus/
// Submitted by Hector Martin <marcan@euskalencounter.org>
user.party.eus

// Association potager.org : https://potager.org/
// Submitted by Lunar <jardiniers@potager.org>
pimienta.org
poivron.org
potager.org
sweetpepper.org

// ASUSTOR Inc. : http://www.asustor.com
// Submitted by Vincent Tseng <vincenttseng@asustor.com>
myasustor.com

// Atlassian : https://atlassian.com
// Submitted by Sam Smyth <devloop@atlassian.com>
cdn.prod.atlassian-dev.net

// Authentick UG (haftungsbeschränkt) : https://authentick.net
// Submitted by Lukas Reschke <lukas@authentick.net>
translated.page

// Autocode : https://autocode.com
// Submitted by Jacob Lee <jacob@autocode.com>
autocode.dev

// AVM : https://avm.de
// Submitted by Andreas Weise <a.weise@avm.de>
myfritz.net

// AVStack Pte. Ltd. : https://avstack.io
// Submitted by Jasper Hugo <jasper@avstack.io>
onavstack.net

// AW AdvisorWebsites.com Software Inc : https://advisorwebsites.com
// Submitted by James Kennedy <domains@advisorwebsites.com>
*.awdev.ca
*.advisor.ws

// AZ.pl sp. z.o.o: https://az.pl
// Submitted by Krzysztof Wolski <krzysztof.wolski@home.eu>
ecommerce-shop.pl

// b-data GmbH : https://www.b-data.io
// Submitted by Olivier Benz <olivier.benz@b-data.ch>
b-data.io

// backplane : https://www.backplane.io
// Submitted by Anthony Voutas <anthony@backplane.io>
backplaneapp.io

// Balena : https://www.balena.io
// Submitted by Petros Angelatos <petrosagg@balena.io>
balena-devices.com

// University of Banja Luka : https://unibl.org
// Domains for Republic of Srpska administrative entity.
// Submitted by Marko Ivanovic <kormang@hotmail.rs>
rs.ba

// Banzai Cloud
// Submitted by Janos Matyas <info@banzaicloud.com>
*.banzai.cloud
app.banzaicloud.io
*.backyards.banzaicloud.io

// BASE, Inc. : https://binc.jp
// Submitted by Yuya NAGASAWA <public-suffix-list@binc.jp>
base.ec
official.ec
buyshop.jp
fashionstore.jp
handcrafted.jp
kawaiishop.jp
supersale.jp
theshop.jp
shopselect.net
base.shop

// BeagleBoard.org Foundation : https://beagleboard.org
// Submitted by Jason Kridner <jkridner@beagleboard.org>
beagleboard.io

// Beget Ltd
// Submitted by Lev Nekrasov <lnekrasov@beget.com>
*.beget.app

// BetaInABox
// Submitted by Adrian <adrian@betainabox.com>
betainabox.com

// BinaryLane : http://www.binarylane.com
// Submitted by Nathan O'Sullivan <nathan@mammoth.com.au>
bnr.la

// Bitbucket : http://bitbucket.org
// Submitted by Andy Ortlieb <aortlieb@atlassian.com>
bitbucket.io

// Blackbaud, Inc. : https://www.blackbaud.com
// Submitted by Paul Crowder <paul.crowder@blackbaud.com>
blackbaudcdn.net

// Blatech : http://www.blatech.net
// Submitted by Luke Bratch <luke@bratch.co.uk>
of.je

// Blue Bite, LLC : https://bluebite.com
// Submitted by Joshua Weiss <admin.engineering@bluebite.com>
bluebite.io

// Boomla : https://boomla.com
// Submitted by Tibor Halter <thalter@boomla.com>
boomla.net

// Boutir : https://www.boutir.com
// Submitted by Eric Ng Ka Ka <ngkaka@boutir.com>
boutir.com

// Boxfuse : https://boxfuse.com
// Submitted by Axel Fontaine <axel@boxfuse.com>
boxfuse.io

// bplaced : https://www.bplaced.net/
// Submitted by Miroslav Bozic <security@bplaced.net>
square7.ch
bplaced.com
bplaced.de
square7.de
bplaced.net
square7.net

// Brendly : https://brendly.rs
// Submitted by Dusan Radovanovic <dusan.radovanovic@brendly.rs>
shop.brendly.rs

// BrowserSafetyMark
// Submitted by Dave Tharp <browsersafetymark.io@quicinc.com>
browsersafetymark.io

// Bytemark Hosting : https://www.bytemark.co.uk
// Submitted by Paul Cammish <paul.cammish@bytemark.co.uk>
uk0.bigv.io
dh.bytemark.co.uk
vm.bytemark.co.uk

// Caf.js Labs LLC : https://www.cafjs.com
// Submitted by Antonio Lain <antlai@cafjs.com>
cafjs.com

// callidomus : https://www.callidomus.com/
// Submitted by Marcus Popp <admin@callidomus.com>
mycd.eu

// Canva Pty Ltd : https://canva.com/
// Submitted by Joel Aquilina <publicsuffixlist@canva.com>
canva-apps.cn
canva-apps.com

// Carrd : https://carrd.co
// Submitted by AJ <aj@carrd.co>
drr.ac
uwu.ai
carrd.co
crd.co
ju.mp

// CentralNic : http://www.centralnic.com/names/domains
// Submitted by registry <gavin.brown@centralnic.com>
ae.org
br.com
cn.com
com.de
com.se
de.com
eu.com
gb.net
hu.net
jp.net
jpn.com
mex.com
ru.com
sa.com
se.net
uk.com
uk.net
us.com
za.bz
za.com

// No longer operated by CentralNic, these entries should be adopted and/or removed by current operators
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
ar.com
hu.com
kr.com
no.com
qc.com
uy.com

// Africa.com Web Solutions Ltd : https://registry.africa.com
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
africa.com

// iDOT Services Limited : http://www.domain.gr.com
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
gr.com

// Radix FZC : http://domains.in.net
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
in.net
web.in

// US REGISTRY LLC : http://us.org
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
us.org

// co.com Registry, LLC : https://registry.co.com
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
co.com

// Roar Domains LLC : https://roar.basketball/
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
aus.basketball
nz.basketball

// BRS Media : https://brsmedia.com/
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
radio.am
radio.fm

// c.la : http://www.c.la/
c.la

// certmgr.org : https://certmgr.org
// Submitted by B. Blechschmidt <hostmaster@certmgr.org>
certmgr.org

// Cityhost LLC  : https://cityhost.ua
// Submitted by Maksym Rivtin <support@cityhost.net.ua>
cx.ua

// Civilized Discourse Construction Kit, Inc. : https://www.discourse.org/
// Submitted by Rishabh Nambiar & Michael Brown <team@discourse.org>
discourse.group
discourse.team

// Clever Cloud : https://www.clever-cloud.com/
// Submitted by Quentin Adam <noc@clever-cloud.com>
cleverapps.io

// Clerk : https://www.clerk.dev
// Submitted by Colin Sidoti <systems@clerk.dev>
clerk.app
clerkstage.app
*.lcl.dev
*.lclstage.dev
*.stg.dev
*.stgstage.dev

// ClickRising : https://clickrising.com/
// Submitted by Umut Gumeli <infrastructure-publicsuffixlist@clickrising.com>
clickrising.net

// Cloud66 : https://www.cloud66.com/
// Submitted by Khash Sajadi <khash@cloud66.com>
c66.me
cloud66.ws
cloud66.zone

// CloudAccess.net : https://www.cloudaccess.net/
// Submitted by Pawel Panek <noc@cloudaccess.net>
jdevcloud.com
wpdevcloud.com
cloudaccess.host
freesite.host
cloudaccess.net

// cloudControl : https://www.cloudcontrol.com/
// Submitted by Tobias Wilken <tw@cloudcontrol.com>
cloudcontrolled.com
cloudcontrolapp.com

// Cloudera, Inc. : https://www.cloudera.com/
// Submitted by Kedarnath Waikar <security@cloudera.com>
*.cloudera.site

// Cloudflare, Inc. : https://www.cloudflare.com/
// Submitted by Cloudflare Team <publicsuffixlist@cloudflare.com>
cf-ipfs.com
cloudflare-ipfs.com
trycloudflare.com
pages.dev
r2.dev
workers.dev

// Clovyr : https://clovyr.io
// Submitted by Patrick Nielsen <patrick@clovyr.io>
wnext.app

// co.ca : http://registry.co.ca/
co.ca

// Co & Co : https://co-co.nl/
// Submitted by Govert Versluis <govert@co-co.nl>
*.otap.co

// i-registry s.r.o. : http://www.i-registry.cz/
// Submitted by Martin Semrad <semrad@i-registry.cz>
co.cz

// CDN77.com : http://www.cdn77.com
// Submitted by Jan Krpes <jan.krpes@cdn77.com>
c.cdn77.org
cdn77-ssl.net
r.cdn77.net
rsc.cdn77.org
ssl.origin.cdn77-secure.org

// Cloud DNS Ltd : http://www.cloudns.net
// Submitted by Aleksander Hristov <noc@cloudns.net>
cloudns.asia
cloudns.biz
cloudns.club
cloudns.cc
cloudns.eu
cloudns.in
cloudns.info
cloudns.org
cloudns.pro
cloudns.pw
cloudns.us

// CNPY : https://cnpy.gdn
// Submitted by Angelo Gladding <angelo@lahacker.net>
cnpy.gdn

// Codeberg e. V. : https://codeberg.org
// Submitted by Moritz Marquardt <git@momar.de>
codeberg.page

// CoDNS B.V.
co.nl
co.no

// Combell.com : https://www.combell.com
// Submitted by Thomas Wouters <thomas.wouters@combellgroup.com>
webhosting.be
hosting-cluster.nl

// Coordination Center for TLD RU and XN--P1AI : https://cctld.ru/en/domains/domens_ru/reserved/
// Submitted by George Georgievsky <gug@cctld.ru>
ac.ru
edu.ru
gov.ru
int.ru
mil.ru
test.ru

// COSIMO GmbH : http://www.cosimo.de
// Submitted by Rene Marticke <rmarticke@cosimo.de>
dyn.cosidns.de
dynamisches-dns.de
dnsupdater.de
internet-dns.de
l-o-g-i-n.de
dynamic-dns.info
feste-ip.net
knx-server.net
static-access.net

// Craynic, s.r.o. : http://www.craynic.com/
// Submitted by Ales Krajnik <ales.krajnik@craynic.com>
realm.cz

// Cryptonomic : https://cryptonomic.net/
// Submitted by Andrew Cady <public-suffix-list@cryptonomic.net>
*.cryptonomic.net

// Cupcake : https://cupcake.io/
// Submitted by Jonathan Rudenberg <jonathan@cupcake.io>
cupcake.is

// Curv UG : https://curv-labs.de/
// Submitted by Marvin Wiesner <Marvin@curv-labs.de>
curv.dev

// Customer OCI - Oracle Dyn https://cloud.oracle.com/home https://dyn.com/dns/
// Submitted by Gregory Drake <support@dyn.com>
// Note: This is intended to also include customer-oci.com due to wildcards implicitly including the current label
*.customer-oci.com
*.oci.customer-oci.com
*.ocp.customer-oci.com
*.ocs.customer-oci.com

// cyon GmbH : https://www.cyon.ch/
// Submitted by Dominic Luechinger <dol@cyon.ch>
cyon.link
cyon.site

// Danger Science Group: https://dangerscience.com/
// Submitted by Skylar MacDonald <skylar@dangerscience.com>
fnwk.site
folionetwork.site
platform0.app

// Daplie, Inc : https://daplie.com
// Submitted by AJ ONeal <aj@daplie.com>
daplie.me
localhost.daplie.me

// Datto, Inc. : https://www.datto.com/
// Submitted by Philipp Heckel <ph@datto.com>
dattolocal.com
dattorelay.com
dattoweb.com
mydatto.com
dattolocal.net
mydatto.net

// Dansk.net : http://www.dansk.net/
// Submitted by Anani Voule <digital@digital.co.dk>
biz.dk
co.dk
firm.dk
reg.dk
store.dk

// dappnode.io : https://dappnode.io/
// Submitted by Abel Boldu / DAppNode Team <community@dappnode.io>
dyndns.dappnode.io

// dapps.earth : https://dapps.earth/
// Submitted by Daniil Burdakov <icqkill@gmail.com>
*.dapps.earth
*.bzz.dapps.earth

// Dark, Inc. : https://darklang.com
// Submitted by Paul Biggar <ops@darklang.com>
builtwithdark.com

// DataDetect, LLC. : https://datadetect.com
// Submitted by Andrew Banchich <abanchich@sceven.com>
demo.datadetect.com
instance.datadetect.com

// Datawire, Inc : https://www.datawire.io
// Submitted by Richard Li <secalert@datawire.io>
edgestack.me

// DDNS5 : https://ddns5.com
// Submitted by Cameron Elliott <cameron@cameronelliott.com>
ddns5.com

// Debian : https://www.debian.org/
// Submitted by Peter Palfrader / Debian Sysadmin Team <dsa-publicsuffixlist@debian.org>
debian.net

// Deno Land Inc : https://deno.com/
// Submitted by Luca Casonato <hostmaster@deno.com>
deno.dev
deno-staging.dev

// deSEC : https://desec.io/
// Submitted by Peter Thomassen <peter@desec.io>
dedyn.io

// Deta: https://www.deta.sh/
// Submitted by Aavash Shrestha <aavash@deta.sh>
deta.app
deta.dev

// Diher Solutions : https://diher.solutions
// Submitted by Didi Hermawan <mail@diher.solutions>
*.rss.my.id
*.diher.solutions

// Discord Inc : https://discord.com
// Submitted by Sahn Lam <slam@discordapp.com>
discordsays.com
discordsez.com

// DNS Africa Ltd https://dns.business
// Submitted by Calvin Browne <calvin@dns.business>
jozi.biz

// DNShome : https://www.dnshome.de/
// Submitted by Norbert Auler <mail@dnshome.de>
dnshome.de

// DotArai : https://www.dotarai.com/
// Submitted by Atsadawat Netcharadsang <atsadawat@dotarai.co.th>
online.th
shop.th

// DrayTek Corp. : https://www.draytek.com/
// Submitted by Paul Fang <mis@draytek.com>
drayddns.com

// DreamCommerce : https://shoper.pl/
// Submitted by Konrad Kotarba <konrad.kotarba@dreamcommerce.com>
shoparena.pl

// DreamHost : http://www.dreamhost.com/
// Submitted by Andrew Farmer <andrew.farmer@dreamhost.com>
dreamhosters.com

// Drobo : http://www.drobo.com/
// Submitted by Ricardo Padilha <rpadilha@drobo.com>
mydrobo.com

// Drud Holdings, LLC. : https://www.drud.com/
// Submitted by Kevin Bridges <kevin@drud.com>
drud.io
drud.us

// DuckDNS : http://www.duckdns.org/
// Submitted by Richard Harper <richard@duckdns.org>
duckdns.org

// Bip : https://bip.sh
// Submitted by Joel Kennedy <joel@bip.sh>
bip.sh

// bitbridge.net : Submitted by Craig Welch, abeliidev@gmail.com
bitbridge.net

// dy.fi : http://dy.fi/
// Submitted by Heikki Hannikainen <hessu@hes.iki.fi>
dy.fi
tunk.org

// DynDNS.com : http://www.dyndns.com/services/dns/dyndns/
dyndns-at-home.com
dyndns-at-work.com
dyndns-blog.com
dyndns-free.com
dyndns-home.com
dyndns-ip.com
dyndns-mail.com
dyndns-office.com
dyndns-pics.com
dyndns-remote.com
dyndns-server.com
dyndns-web.com
dyndns-wiki.com
dyndns-work.com
dyndns.biz
dyndns.info
dyndns.org
dyndns.tv
at-band-camp.net
ath.cx
barrel-of-knowledge.info
barrell-of-knowledge.info
better-than.tv
blogdns.com
blogdns.net
blogdns.org
blogsite.org
boldlygoingnowhere.org
broke-it.net
buyshouses.net
cechire.com
dnsalias.com
dnsalias.net
dnsalias.org
dnsdojo.com
dnsdojo.net
dnsdojo.org
does-it.net
doesntexist.com
doesntexist.org
dontexist.com
dontexist.net
dontexist.org
doomdns.com
doomdns.org
dvrdns.org
dyn-o-saur.com
dynalias.com
dynalias.net
dynalias.org
dynathome.net
dyndns.ws
endofinternet.net
endofinternet.org
endoftheinternet.org
est-a-la-maison.com
est-a-la-masion.com
est-le-patron.com
est-mon-blogueur.com
for-better.biz
for-more.biz
for-our.info
for-some.biz
for-the.biz
forgot.her.name
forgot.his.name
from-ak.com
from-al.com
from-ar.com
from-az.net
from-ca.com
from-co.net
from-ct.com
from-dc.com
from-de.com
from-fl.com
from-ga.com
from-hi.com
from-ia.com
from-id.com
from-il.com
from-in.com
from-ks.com
from-ky.com
from-la.net
from-ma.com
from-md.com
from-me.org
from-mi.com
from-mn.com
from-mo.com
from-ms.com
from-mt.com
from-nc.com
from-nd.com
from-ne.com
from-nh.com
from-nj.com
from-nm.com
from-nv.com
from-ny.net
from-oh.com
from-ok.com
from-or.com
from-pa.com
from-pr.com
from-ri.com
from-sc.com
from-sd.com
from-tn.com
from-tx.com
from-ut.com
from-va.com
from-vt.com
from-wa.com
from-wi.com
from-wv.com
from-wy.com
ftpaccess.cc
fuettertdasnetz.de
game-host.org
game-server.cc
getmyip.com
gets-it.net
go.dyndns.org
gotdns.com
gotdns.org
groks-the.info
groks-this.info
ham-radio-op.net
here-for-more.info
hobby-site.com
hobby-site.org
home.dyndns.org
homedns.org
homeftp.net
homeftp.org
homeip.net
homelinux.com
homelinux.net
homelinux.org
homeunix.com
homeunix.net
homeunix.org
iamallama.com
in-the-band.net
is-a-anarchist.com
is-a-blogger.com
is-a-bookkeeper.com
is-a-bruinsfan.org
is-a-bulls-fan.com
is-a-candidate.org
is-a-caterer.com
is-a-celticsfan.org
is-a-chef.com
is-a-chef.net
is-a-chef.org
is-a-conservative.com
is-a-cpa.com
is-a-cubicle-slave.com
is-a-democrat.com
is-a-designer.com
is-a-doctor.com
is-a-financialadvisor.com
is-a-geek.com
is-a-geek.net
is-a-geek.org
is-a-green.com
is-a-guru.com
is-a-hard-worker.com
is-a-hunter.com
is-a-knight.org
is-a-landscaper.com
is-a-lawyer.com
is-a-liberal.com
is-a-libertarian.com
is-a-linux-user.org
is-a-llama.com
is-a-musician.com
is-a-nascarfan.com
is-a-nurse.com
is-a-painter.com
is-a-patsfan.org
is-a-personaltrainer.com
is-a-photographer.com
is-a-player.com
is-a-republican.com
is-a-rockstar.com
is-a-socialist.com
is-a-soxfan.org
is-a-student.com
is-a-teacher.com
is-a-techie.com
is-a-therapist.com
is-an-accountant.com
is-an-actor.com
is-an-actress.com
is-an-anarchist.com
is-an-artist.com
is-an-engineer.com
is-an-entertainer.com
is-by.us
is-certified.com
is-found.org
is-gone.com
is-into-anime.com
is-into-cars.com
is-into-cartoons.com
is-into-games.com
is-leet.com
is-lost.org
is-not-certified.com
is-saved.org
is-slick.com
is-uberleet.com
is-very-bad.org
is-very-evil.org
is-very-good.org
is-very-nice.org
is-very-sweet.org
is-with-theband.com
isa-geek.com
isa-geek.net
isa-geek.org
isa-hockeynut.com
issmarterthanyou.com
isteingeek.de
istmein.de
kicks-ass.net
kicks-ass.org
knowsitall.info
land-4-sale.us
lebtimnetz.de
leitungsen.de
likes-pie.com
likescandy.com
merseine.nu
mine.nu
misconfused.org
mypets.ws
myphotos.cc
neat-url.com
office-on-the.net
on-the-web.tv
podzone.net
podzone.org
readmyblog.org
saves-the-whales.com
scrapper-site.net
scrapping.cc
selfip.biz
selfip.com
selfip.info
selfip.net
selfip.org
sells-for-less.com
sells-for-u.com
sells-it.net
sellsyourhome.org
servebbs.com
servebbs.net
servebbs.org
serveftp.net
serveftp.org
servegame.org
shacknet.nu
simple-url.com
space-to-rent.com
stuff-4-sale.org
stuff-4-sale.us
teaches-yoga.com
thruhere.net
traeumtgerade.de
webhop.biz
webhop.info
webhop.net
webhop.org
worse-than.tv
writesthisblog.com

// ddnss.de : https://www.ddnss.de/
// Submitted by Robert Niedziela <webmaster@ddnss.de>
ddnss.de
dyn.ddnss.de
dyndns.ddnss.de
dyndns1.de
dyn-ip24.de
home-webserver.de
dyn.home-webserver.de
myhome-server.de
ddnss.org

// Definima : http://www.definima.com/
// Submitted by Maxence Bitterli <maxence@definima.com>
definima.net
definima.io

// DigitalOcean App Platform : https://www.digitalocean.com/products/app-platform/
// Submitted by Braxton Huggins <psl-maintainers@digitalocean.com>
ondigitalocean.app

// DigitalOcean Spaces : https://www.digitalocean.com/products/spaces/
// Submitted by Robin H. Johnson <psl-maintainers@digitalocean.com>
*.digitaloceanspaces.com

// dnstrace.pro : https://dnstrace.pro/
// Submitted by Chris Partridge <chris@partridge.tech>
bci.dnstrace.pro

// Dynu.com : https://www.dynu.com/
// Submitted by Sue Ye <sue@dynu.com>
ddnsfree.com
ddnsgeek.com
giize.com
gleeze.com
kozow.com
loseyourip.com
ooguy.com
theworkpc.com
casacam.net
dynu.net
accesscam.org
camdvr.org
freeddns.org
mywire.org
webredirect.org
myddns.rocks
blogsite.xyz

// dynv6 : https://dynv6.com
// Submitted by Dominik Menke <dom@digineo.de>
dynv6.net

// E4YOU spol. s.r.o. : https://e4you.cz/
// Submitted by Vladimir Dudr <info@e4you.cz>
e4.cz

// Easypanel : https://easypanel.io
// Submitted by Andrei Canta <andrei@easypanel.io>
easypanel.app
easypanel.host

// Elementor : Elementor Ltd.
// Submitted by Anton Barkan <antonb@elementor.com>
elementor.cloud
elementor.cool

// En root‽ : https://en-root.org
// Submitted by Emmanuel Raviart <emmanuel@raviart.com>
en-root.fr

// Enalean SAS: https://www.enalean.com
// Submitted by Thomas Cottier <thomas.cottier@enalean.com>
mytuleap.com
tuleap-partners.com

// Encoretivity AB: https://encore.dev
// Submitted by André Eriksson <andre@encore.dev>
encr.app
encoreapi.com

// ECG Robotics, Inc: https://ecgrobotics.org
// Submitted by <frc1533@ecgrobotics.org>
onred.one
staging.onred.one

// encoway GmbH : https://www.encoway.de
// Submitted by Marcel Daus <cloudops@encoway.de>
eu.encoway.cloud

// EU.org https://eu.org/
// Submitted by Pierre Beyssac <hostmaster@eu.org>
eu.org
al.eu.org
asso.eu.org
at.eu.org
au.eu.org
be.eu.org
bg.eu.org
ca.eu.org
cd.eu.org
ch.eu.org
cn.eu.org
cy.eu.org
cz.eu.org
de.eu.org
dk.eu.org
edu.eu.org
ee.eu.org
es.eu.org
fi.eu.org
fr.eu.org
gr.eu.org
hr.eu.org
hu.eu.org
ie.eu.org
il.eu.org
in.eu.org
int.eu.org
is.eu.org
it.eu.org
jp.eu.org
kr.eu.org
lt.eu.org
lu.eu.org
lv.eu.org
mc.eu.org
me.eu.org
mk.eu.org
mt.eu.org
my.eu.org
net.eu.org
ng.eu.org
nl.eu.org
no.eu.org
nz.eu.org
paris.eu.org
pl.eu.org
pt.eu.org
q-a.eu.org
ro.eu.org
ru.eu.org
se.eu.org
si.eu.org
sk.eu.org
tr.eu.org
uk.eu.org
us.eu.org

// Eurobyte : https://eurobyte.ru
// Submitted by Evgeniy Subbotin <e.subbotin@eurobyte.ru>
eurodir.ru

// Evennode : http://www.evennode.com/
// Submitted by Michal Kralik <support@evennode.com>
eu-1.evennode.com
eu-2.evennode.com
eu-3.evennode.com
eu-4.evennode.com
us-1.evennode.com
us-2.evennode.com
us-3.evennode.com
us-4.evennode.com

// eDirect Corp. : https://hosting.url.com.tw/
// Submitted by C.S. chang <cschang@corp.url.com.tw>
twmail.cc
twmail.net
twmail.org
mymailer.com.tw
url.tw

// Fabrica Technologies, Inc. : https://www.fabrica.dev/
// Submitted by Eric Jiang <eric@fabrica.dev>
onfabrica.com

// Facebook, Inc.
// Submitted by Peter Ruibal <public-suffix@fb.com>
apps.fbsbx.com

// FAITID : https://faitid.org/
// Submitted by Maxim Alzoba <tech.contact@faitid.org>
// https://www.flexireg.net/stat_info
ru.net
adygeya.ru
bashkiria.ru
bir.ru
cbg.ru
com.ru
dagestan.ru
grozny.ru
kalmykia.ru
kustanai.ru
marine.ru
mordovia.ru
msk.ru
mytis.ru
nalchik.ru
nov.ru
pyatigorsk.ru
spb.ru
vladikavkaz.ru
vladimir.ru
abkhazia.su
adygeya.su
aktyubinsk.su
arkhangelsk.su
armenia.su
ashgabad.su
azerbaijan.su
balashov.su
bashkiria.su
bryansk.su
bukhara.su
chimkent.su
dagestan.su
east-kazakhstan.su
exnet.su
georgia.su
grozny.su
ivanovo.su
jambyl.su
kalmykia.su
kaluga.su
karacol.su
karaganda.su
karelia.su
khakassia.su
krasnodar.su
kurgan.su
kustanai.su
lenug.su
mangyshlak.su
mordovia.su
msk.su
murmansk.su
nalchik.su
navoi.su
north-kazakhstan.su
nov.su
obninsk.su
penza.su
pokrovsk.su
sochi.su
spb.su
tashkent.su
termez.su
togliatti.su
troitsk.su
tselinograd.su
tula.su
tuva.su
vladikavkaz.su
vladimir.su
vologda.su

// Fancy Bits, LLC : http://getchannels.com
// Submitted by Aman Gupta <aman@getchannels.com>
channelsdvr.net
u.channelsdvr.net

// Fastly Inc. : http://www.fastly.com/
// Submitted by Fastly Security <security@fastly.com>
edgecompute.app
fastly-edge.com
fastly-terrarium.com
fastlylb.net
map.fastlylb.net
freetls.fastly.net
map.fastly.net
a.prod.fastly.net
global.prod.fastly.net
a.ssl.fastly.net
b.ssl.fastly.net
global.ssl.fastly.net

// Fastmail : https://www.fastmail.com/
// Submitted by Marc Bradshaw <marc@fastmailteam.com>
*.user.fm

// FASTVPS EESTI OU : https://fastvps.ru/
// Submitted by Likhachev Vasiliy <lihachev@fastvps.ru>
fastvps-server.com
fastvps.host
myfast.host
fastvps.site
myfast.space

// Fedora : https://fedoraproject.org/
// submitted by Patrick Uiterwijk <puiterwijk@fedoraproject.org>
fedorainfracloud.org
fedorapeople.org
cloud.fedoraproject.org
app.os.fedoraproject.org
app.os.stg.fedoraproject.org

// FearWorks Media Ltd. : https://fearworksmedia.co.uk
// submitted by Keith Fairley <domains@fearworksmedia.co.uk>
conn.uk
copro.uk
hosp.uk

// Fermax : https://fermax.com/
// submitted by Koen Van Isterdael <k.vanisterdael@fermax.be>
mydobiss.com

// FH Muenster : https://www.fh-muenster.de
// Submitted by Robin Naundorf <r.naundorf@fh-muenster.de>
fh-muenster.io

// Filegear Inc. : https://www.filegear.com
// Submitted by Jason Zhu <jason@owtware.com>
filegear.me
filegear-au.me
filegear-de.me
filegear-gb.me
filegear-ie.me
filegear-jp.me
filegear-sg.me

// Firebase, Inc.
// Submitted by Chris Raynor <chris@firebase.com>
firebaseapp.com

// Firewebkit : https://www.firewebkit.com
// Submitted by Majid Qureshi <mqureshi@amrayn.com>
fireweb.app

// FLAP : https://www.flap.cloud
// Submitted by Louis Chemineau <louis@chmn.me>
flap.id

// FlashDrive : https://flashdrive.io
// Submitted by Eric Chan <support@flashdrive.io>
onflashdrive.app
fldrv.com

// fly.io: https://fly.io
// Submitted by Kurt Mackey <kurt@fly.io>
fly.dev
edgeapp.net
shw.io

// Flynn : https://flynn.io
// Submitted by Jonathan Rudenberg <jonathan@flynn.io>
flynnhosting.net

// Forgerock : https://www.forgerock.com
// Submitted by Roderick Parr <roderick.parr@forgerock.com>
forgeblocks.com
id.forgerock.io

// Framer : https://www.framer.com
// Submitted by Koen Rouwhorst <koenrh@framer.com>
framer.app
framercanvas.com
framer.media
framer.photos
framer.website
framer.wiki

// Frusky MEDIA&PR : https://www.frusky.de
// Submitted by Victor Pupynin <hallo@frusky.de>
*.frusky.de

// RavPage : https://www.ravpage.co.il
// Submitted by Roni Horowitz <roni@responder.co.il>
ravpage.co.il

// Frederik Braun https://frederik-braun.com
// Submitted by Frederik Braun <fb@frederik-braun.com>
0e.vc

// Freebox : http://www.freebox.fr
// Submitted by Romain Fliedel <rfliedel@freebox.fr>
freebox-os.com
freeboxos.com
fbx-os.fr
fbxos.fr
freebox-os.fr
freeboxos.fr

// freedesktop.org : https://www.freedesktop.org
// Submitted by Daniel Stone <daniel@fooishbar.org>
freedesktop.org

// freemyip.com : https://freemyip.com
// Submitted by Cadence <contact@freemyip.com>
freemyip.com

// FunkFeuer - Verein zur Förderung freier Netze : https://www.funkfeuer.at
// Submitted by Daniel A. Maierhofer <vorstand@funkfeuer.at>
wien.funkfeuer.at

// Futureweb OG : http://www.futureweb.at
// Submitted by Andreas Schnederle-Wagner <schnederle@futureweb.at>
*.futurecms.at
*.ex.futurecms.at
*.in.futurecms.at
futurehosting.at
futuremailing.at
*.ex.ortsinfo.at
*.kunden.ortsinfo.at
*.statics.cloud

// GDS : https://www.gov.uk/service-manual/technology/managing-domain-names
// Submitted by Stephen Ford <hostmaster@digital.cabinet-office.gov.uk>
independent-commission.uk
independent-inquest.uk
independent-inquiry.uk
independent-panel.uk
independent-review.uk
public-inquiry.uk
royal-commission.uk
campaign.gov.uk
service.gov.uk

// CDDO : https://www.gov.uk/guidance/get-an-api-domain-on-govuk
// Submitted by Jamie Tanna <jamie.tanna@digital.cabinet-office.gov.uk>
api.gov.uk

// Gehirn Inc. : https://www.gehirn.co.jp/
// Submitted by Kohei YOSHIDA <tech@gehirn.co.jp>
gehirn.ne.jp
usercontent.jp

// Gentlent, Inc. : https://www.gentlent.com
// Submitted by Tom Klein <tom@gentlent.com>
gentapps.com
gentlentapis.com
lab.ms
cdn-edges.net

// Ghost Foundation : https://ghost.org
// Submitted by Matt Hanley <security@ghost.org>
ghost.io

// GignoSystemJapan: http://gsj.bz
// Submitted by GignoSystemJapan <kakutou-ec@gsj.bz>
gsj.bz

// GitHub, Inc.
// Submitted by Patrick Toomey <security@github.com>
githubusercontent.com
githubpreview.dev
github.io

// GitLab, Inc.
// Submitted by Alex Hanselka <alex@gitlab.com>
gitlab.io

// Gitplac.si - https://gitplac.si
// Submitted by Aljaž Starc <me@aljaxus.eu>
gitapp.si
gitpage.si

// Glitch, Inc : https://glitch.com
// Submitted by Mads Hartmann <mads@glitch.com>
glitch.me

// Global NOG Alliance : https://nogalliance.org/
// Submitted by Sander Steffann <sander@nogalliance.org>
nog.community

// Globe Hosting SRL : https://www.globehosting.com/
// Submitted by Gavin Brown <gavin.brown@centralnic.com>
co.ro
shop.ro

// GMO Pepabo, Inc. : https://pepabo.com/
// Submitted by Hosting Div <admin@pepabo.com>
lolipop.io
angry.jp
babyblue.jp
babymilk.jp
backdrop.jp
bambina.jp
bitter.jp
blush.jp
boo.jp
boy.jp
boyfriend.jp
but.jp
candypop.jp
capoo.jp
catfood.jp
cheap.jp
chicappa.jp
chillout.jp
chips.jp
chowder.jp
chu.jp
ciao.jp
cocotte.jp
coolblog.jp
cranky.jp
cutegirl.jp
daa.jp
deca.jp
deci.jp
digick.jp
egoism.jp
fakefur.jp
fem.jp
flier.jp
floppy.jp
fool.jp
frenchkiss.jp
girlfriend.jp
girly.jp
gloomy.jp
gonna.jp
greater.jp
hacca.jp
heavy.jp
her.jp
hiho.jp
hippy.jp
holy.jp
hungry.jp
icurus.jp
itigo.jp
jellybean.jp
kikirara.jp
kill.jp
kilo.jp
kuron.jp
littlestar.jp
lolipopmc.jp
lolitapunk.jp
lomo.jp
lovepop.jp
lovesick.jp
main.jp
mods.jp
mond.jp
mongolian.jp
moo.jp
namaste.jp
nikita.jp
nobushi.jp
noor.jp
oops.jp
parallel.jp
parasite.jp
pecori.jp
peewee.jp
penne.jp
pepper.jp
perma.jp
pigboat.jp
pinoko.jp
punyu.jp
pupu.jp
pussycat.jp
pya.jp
raindrop.jp
readymade.jp
sadist.jp
schoolbus.jp
secret.jp
staba.jp
stripper.jp
sub.jp
sunnyday.jp
thick.jp
tonkotsu.jp
under.jp
upper.jp
velvet.jp
verse.jp
versus.jp
vivian.jp
watson.jp
weblike.jp
whitesnow.jp
zombie.jp
heteml.net

// GOV.UK Platform as a Service : https://www.cloud.service.gov.uk/
// Submitted by Tom Whitwell <gov-uk-paas-support@digital.cabinet-office.gov.uk>
cloudapps.digital
london.cloudapps.digital

// GOV.UK Pay : https://www.payments.service.gov.uk/
// Submitted by Richard Baker <richard.baker@digital.cabinet-office.gov.uk>
pymnt.uk

// UKHomeOffice : https://www.gov.uk/government/organisations/home-office
// Submitted by Jon Shanks <jon.shanks@digital.homeoffice.gov.uk>
homeoffice.gov.uk

// GlobeHosting, Inc.
// Submitted by Zoltan Egresi <egresi@globehosting.com>
ro.im

// GoIP DNS Services : http://www.goip.de
// Submitted by Christian Poulter <milchstrasse@goip.de>
goip.de

// Google, Inc.
// Submitted by Eduardo Vela <evn@google.com>
run.app
a.run.app
web.app
*.0emm.com
appspot.com
*.r.appspot.com
codespot.com
googleapis.com
googlecode.com
pagespeedmobilizer.com
publishproxy.com
withgoogle.com
withyoutube.com
*.gateway.dev
cloud.goog
translate.goog
*.usercontent.goog
cloudfunctions.net
blogspot.ae
blogspot.al
blogspot.am
blogspot.ba
blogspot.be
blogspot.bg
blogspot.bj
blogspot.ca
blogspot.cf
blogspot.ch
blogspot.cl
blogspot.co.at
blogspot.co.id
blogspot.co.il
blogspot.co.ke
blogspot.co.nz
blogspot.co.uk
blogspot.co.za
blogspot.com
blogspot.com.ar
blogspot.com.au
blogspot.com.br
blogspot.com.by
blogspot.com.co
blogspot.com.cy
blogspot.com.ee
blogspot.com.eg
blogspot.com.es
blogspot.com.mt
blogspot.com.ng
blogspot.com.tr
blogspot.com.uy
blogspot.cv
blogspot.cz
blogspot.de
blogspot.dk
blogspot.fi
blogspot.fr
blogspot.gr
blogspot.hk
blogspot.hr
blogspot.hu
blogspot.ie
blogspot.in
blogspot.is
blogspot.it
blogspot.jp
blogspot.kr
blogspot.li
blogspot.lt
blogspot.lu
blogspot.md
blogspot.mk
blogspot.mr
blogspot.mx
blogspot.my
blogspot.nl
blogspot.no
blogspot.pe
blogspot.pt
blogspot.qa
blogspot.re
blogspot.ro
blogspot.rs
blogspot.ru
blogspot.se
blogspot.sg
blogspot.si
blogspot.sk
blogspot.sn
blogspot.td
blogspot.tw
blogspot.ug
blogspot.vn

// Goupile : https://goupile.fr
// Submitted by Niels Martignene <hello@goupile.fr>
goupile.fr

// Government of the Netherlands: https://www.government.nl
// Submitted by <domeinnaam@minaz.nl>
gov.nl

// Group 53, LLC : https://www.group53.com
// Submitted by Tyler Todd <noc@nova53.net>
awsmppl.com

// GünstigBestellen : https://günstigbestellen.de
// Submitted by Furkan Akkoc <info@hendelzon.de>
günstigbestellen.de
günstigliefern.de

// Hakaran group: http://hakaran.cz
// Submitted by Arseniy Sokolov <security@hakaran.cz>
fin.ci
free.hr
caa.li
ua.rs
conf.se

// Handshake : https://handshake.org
// Submitted by Mike Damm <md@md.vc>
hs.zone
hs.run

// Hashbang : https://hashbang.sh
hashbang.sh

// Hasura : https://hasura.io
// Submitted by Shahidh K Muhammed <shahidh@hasura.io>
hasura.app
hasura-app.io

// Heilbronn University of Applied Sciences - Faculty Informatics (GitLab Pages): https://www.hs-heilbronn.de
// Submitted by Richard Zowalla <mi-admin@hs-heilbronn.de>
pages.it.hs-heilbronn.de

// Hepforge : https://www.hepforge.org
// Submitted by David Grellscheid <admin@hepforge.org>
hepforge.org

// Heroku : https://www.heroku.com/
// Submitted by Tom Maher <tmaher@heroku.com>
herokuapp.com
herokussl.com

// Hibernating Rhinos
// Submitted by Oren Eini <oren@ravendb.net>
ravendb.cloud
ravendb.community
ravendb.me
development.run
ravendb.run

// home.pl S.A.: https://home.pl
// Submitted by Krzysztof Wolski <krzysztof.wolski@home.eu>
homesklep.pl

// Hong Kong Productivity Council: https://www.hkpc.org/
// Submitted by SECaaS Team <summchan@hkpc.org>
secaas.hk

// Hoplix : https://www.hoplix.com
// Submitted by Danilo De Franco<info@hoplix.shop>
hoplix.shop


// HOSTBIP REGISTRY : https://www.hostbip.com/
// Submitted by Atanunu Igbunuroghene <publicsuffixlist@hostbip.com>
orx.biz
biz.gl
col.ng
firm.ng
gen.ng
ltd.ng
ngo.ng
edu.scot
sch.so

// HostFly : https://www.ie.ua
// Submitted by Bohdan Dub <support@hostfly.com.ua>
ie.ua

// HostyHosting (hostyhosting.com)
hostyhosting.io

// Häkkinen.fi
// Submitted by Eero Häkkinen <Eero+psl@Häkkinen.fi>
häkkinen.fi

// Ici la Lune : http://www.icilalune.com/
// Submitted by Simon Morvan <simon@icilalune.com>
*.moonscale.io
moonscale.net

// iki.fi
// Submitted by Hannu Aronsson <haa@iki.fi>
iki.fi

// iliad italia: https://www.iliad.it
// Submitted by Marios Makassikis <mmakassikis@freebox.fr>
ibxos.it
iliadboxos.it

// Impertrix Solutions : <https://impertrixcdn.com>
// Submitted by Zhixiang Zhao <csuite@impertrix.com>
impertrixcdn.com
impertrix.com

// Incsub, LLC: https://incsub.com/
// Submitted by Aaron Edwards <sysadmins@incsub.com>
smushcdn.com
wphostedmail.com
wpmucdn.com
tempurl.host
wpmudev.host

// Individual Network Berlin e.V. : https://www.in-berlin.de/
// Submitted by Christian Seitz <chris@in-berlin.de>
dyn-berlin.de
in-berlin.de
in-brb.de
in-butter.de
in-dsl.de
in-dsl.net
in-dsl.org
in-vpn.de
in-vpn.net
in-vpn.org

// info.at : http://www.info.at/
biz.at
info.at

// info.cx : http://info.cx
// Submitted by Jacob Slater <whois@igloo.to>
info.cx

// Interlegis : http://www.interlegis.leg.br
// Submitted by Gabriel Ferreira <registrobr@interlegis.leg.br>
ac.leg.br
al.leg.br
am.leg.br
ap.leg.br
ba.leg.br
ce.leg.br
df.leg.br
es.leg.br
go.leg.br
ma.leg.br
mg.leg.br
ms.leg.br
mt.leg.br
pa.leg.br
pb.leg.br
pe.leg.br
pi.leg.br
pr.leg.br
rj.leg.br
rn.leg.br
ro.leg.br
rr.leg.br
rs.leg.br
sc.leg.br
se.leg.br
sp.leg.br
to.leg.br

// intermetrics GmbH : https://pixolino.com/
// Submitted by Wolfgang Schwarz <admin@intermetrics.de>
pixolino.com

// Internet-Pro, LLP: https://netangels.ru/
// Submitted by Vasiliy Sheredeko <piphon@gmail.com>
na4u.ru

// iopsys software solutions AB : https://iopsys.eu/
// Submitted by Roman Azarenko <roman.azarenko@iopsys.eu>
iopsys.se

// IPiFony Systems, Inc. : https://www.ipifony.com/
// Submitted by Matthew Hardeman <mhardeman@ipifony.com>
ipifony.net

// IServ GmbH : https://iserv.de
// Submitted by Mario Hoberg <info@iserv.de>
iservschule.de
mein-iserv.de
schulplattform.de
schulserver.de
test-iserv.de
iserv.dev

// I-O DATA DEVICE, INC. : http://www.iodata.com/
// Submitted by Yuji Minagawa <domains-admin@iodata.jp>
iobb.net

// Jelastic, Inc. : https://jelastic.com/
// Submitted by Ihor Kolodyuk <ik@jelastic.com>
mel.cloudlets.com.au
cloud.interhostsolutions.be
mycloud.by
alp1.ae.flow.ch
appengine.flow.ch
es-1.axarnet.cloud
diadem.cloud
vip.jelastic.cloud
jele.cloud
it1.eur.aruba.jenv-aruba.cloud
it1.jenv-aruba.cloud
keliweb.cloud
cs.keliweb.cloud
oxa.cloud
tn.oxa.cloud
uk.oxa.cloud
primetel.cloud
uk.primetel.cloud
ca.reclaim.cloud
uk.reclaim.cloud
us.reclaim.cloud
ch.trendhosting.cloud
de.trendhosting.cloud
jele.club
amscompute.com
dopaas.com
paas.hosted-by-previder.com
rag-cloud.hosteur.com
rag-cloud-ch.hosteur.com
jcloud.ik-server.com
jcloud-ver-jpc.ik-server.com
demo.jelastic.com
kilatiron.com
paas.massivegrid.com
jed.wafaicloud.com
lon.wafaicloud.com
ryd.wafaicloud.com
j.scaleforce.com.cy
jelastic.dogado.eu
fi.cloudplatform.fi
demo.datacenter.fi
paas.datacenter.fi
jele.host
mircloud.host
paas.beebyte.io
sekd1.beebyteapp.io
jele.io
cloud-fr1.unispace.io
jc.neen.it
cloud.jelastic.open.tim.it
jcloud.kz
upaas.kazteleport.kz
cloudjiffy.net
fra1-de.cloudjiffy.net
west1-us.cloudjiffy.net
jls-sto1.elastx.net
jls-sto2.elastx.net
jls-sto3.elastx.net
faststacks.net
fr-1.paas.massivegrid.net
lon-1.paas.massivegrid.net
lon-2.paas.massivegrid.net
ny-1.paas.massivegrid.net
ny-2.paas.massivegrid.net
sg-1.paas.massivegrid.net
jelastic.saveincloud.net
nordeste-idc.saveincloud.net
j.scaleforce.net
jelastic.tsukaeru.net
sdscloud.pl
unicloud.pl
mircloud.ru
jelastic.regruhosting.ru
enscaled.sg
jele.site
jelastic.team
orangecloud.tn
j.layershift.co.uk
phx.enscaled.us
mircloud.us

// Jino : https://www.jino.ru
// Submitted by Sergey Ulyashin <ulyashin@jino.ru>
myjino.ru
*.hosting.myjino.ru
*.landing.myjino.ru
*.spectrum.myjino.ru
*.vps.myjino.ru

// Jotelulu S.L. : https://jotelulu.com
// Submitted by Daniel Fariña <ingenieria@jotelulu.com>
jotelulu.cloud

// Joyent : https://www.joyent.com/
// Submitted by Brian Bennett <brian.bennett@joyent.com>
*.triton.zone
*.cns.joyent.com

// JS.ORG : http://dns.js.org
// Submitted by Stefan Keim <admin@js.org>
js.org

// KaasHosting : http://www.kaashosting.nl/
// Submitted by Wouter Bakker <hostmaster@kaashosting.nl>
kaas.gg
khplay.nl

// Kakao : https://www.kakaocorp.com/
// Submitted by JaeYoong Lee <cec@kakaocorp.com>
ktistory.com

// Kapsi : https://kapsi.fi
// Submitted by Tomi Juntunen <erani@kapsi.fi>
kapsi.fi

// Keyweb AG : https://www.keyweb.de
// Submitted by Martin Dannehl <postmaster@keymachine.de>
keymachine.de

// KingHost : https://king.host
// Submitted by Felipe Keller Braz <felipebraz@kinghost.com.br>
kinghost.net
uni5.net

// KnightPoint Systems, LLC : http://www.knightpoint.com/
// Submitted by Roy Keene <rkeene@knightpoint.com>
knightpoint.systems

// KoobinEvent, SL: https://www.koobin.com
// Submitted by Iván Oliva <ivan.oliva@koobin.com>
koobin.events

// KUROKU LTD : https://kuroku.ltd/
// Submitted by DisposaBoy <security@oya.to>
oya.to

// Katholieke Universiteit Leuven: https://www.kuleuven.be
// Submitted by Abuse KU Leuven <abuse@kuleuven.be>
kuleuven.cloud
ezproxy.kuleuven.be

// .KRD : http://nic.krd/data/krd/Registration%20Policy.pdf
co.krd
edu.krd

// Krellian Ltd. : https://krellian.com
// Submitted by Ben Francis <ben@krellian.com>
krellian.net
webthings.io

// LCube - Professional hosting e.K. : https://www.lcube-webhosting.de
// Submitted by Lars Laehn <info@lcube.de>
git-repos.de
lcube-server.de
svn-repos.de

// Leadpages : https://www.leadpages.net
// Submitted by Greg Dallavalle <domains@leadpages.net>
leadpages.co
lpages.co
lpusercontent.com

// Lelux.fi : https://lelux.fi/
// Submitted by Lelux Admin <publisuffix@lelux.site>
lelux.site

// Lifetime Hosting : https://Lifetime.Hosting/
// Submitted by Mike Fillator <support@lifetime.hosting>
co.business
co.education
co.events
co.financial
co.network
co.place
co.technology

// Lightmaker Property Manager, Inc. : https://app.lmpm.com/
// Submitted by Greg Holland <greg.holland@lmpm.com>
app.lmpm.com

// linkyard ldt: https://www.linkyard.ch/
// Submitted by Mario Siegenthaler <mario.siegenthaler@linkyard.ch>
linkyard.cloud
linkyard-cloud.ch

// Linode : https://linode.com
// Submitted by <security@linode.com>
members.linode.com
*.nodebalancer.linode.com
*.linodeobjects.com
ip.linodeusercontent.com

// LiquidNet Ltd : http://www.liquidnetlimited.com/
// Submitted by Victor Velchev <admin@liquidnetlimited.com>
we.bs

// Localcert : https://localcert.dev
// Submitted by Lann Martin <security@localcert.dev>
*.user.localcert.dev

// localzone.xyz
// Submitted by Kenny Niehage <hello@yahe.sh>
localzone.xyz

// Log'in Line : https://www.loginline.com/
// Submitted by Rémi Mach <remi.mach@loginline.com>
loginline.app
loginline.dev
loginline.io
loginline.services
loginline.site

// Lokalized : https://lokalized.nl
// Submitted by Noah Taheij <noah@lokalized.nl>
servers.run

// Lõhmus Family, The
// Submitted by Heiki Lõhmus <hostmaster at lohmus dot me>
lohmus.me

// LubMAN UMCS Sp. z o.o : https://lubman.pl/
// Submitted by Ireneusz Maliszewski <ireneusz.maliszewski@lubman.pl>
krasnik.pl
leczna.pl
lubartow.pl
lublin.pl
poniatowa.pl
swidnik.pl

// Lug.org.uk : https://lug.org.uk
// Submitted by Jon Spriggs <admin@lug.org.uk>
glug.org.uk
lug.org.uk
lugs.org.uk

// Lukanet Ltd : https://lukanet.com
// Submitted by Anton Avramov <register@lukanet.com>
barsy.bg
barsy.co.uk
barsyonline.co.uk
barsycenter.com
barsyonline.com
barsy.club
barsy.de
barsy.eu
barsy.in
barsy.info
barsy.io
barsy.me
barsy.menu
barsy.mobi
barsy.net
barsy.online
barsy.org
barsy.pro
barsy.pub
barsy.ro
barsy.shop
barsy.site
barsy.support
barsy.uk

// Magento Commerce
// Submitted by Damien Tournoud <dtournoud@magento.cloud>
*.magentosite.cloud

// May First - People Link : https://mayfirst.org/
// Submitted by Jamie McClelland <info@mayfirst.org>
mayfirst.info
mayfirst.org

// Mail.Ru Group : https://hb.cldmail.ru
// Submitted by Ilya Zaretskiy <zaretskiy@corp.mail.ru>
hb.cldmail.ru

// Mail Transfer Platform : https://www.neupeer.com
// Submitted by Li Hui <lihui@neupeer.com>
cn.vu

// Maze Play: https://www.mazeplay.com
// Submitted by Adam Humpherys <adam@mws.dev>
mazeplay.com

// mcpe.me : https://mcpe.me
// Submitted by Noa Heyl <hi@noa.dev>
mcpe.me

// McHost : https://mchost.ru
// Submitted by Evgeniy Subbotin <e.subbotin@mchost.ru>
mcdir.me
mcdir.ru
mcpre.ru
vps.mcdir.ru

// Mediatech : https://mediatech.by
// Submitted by Evgeniy Kozhuhovskiy <ugenk@mediatech.by>
mediatech.by
mediatech.dev

// Medicom Health : https://medicomhealth.com
// Submitted by Michael Olson <molson@medicomhealth.com>
hra.health

// Memset hosting : https://www.memset.com
// Submitted by Tom Whitwell <domains@memset.com>
miniserver.com
memset.net

// Messerli Informatik AG : https://www.messerli.ch/
// Submitted by Ruben Schmidmeister <psl-maintainers@messerli.ch>
messerli.app

// MetaCentrum, CESNET z.s.p.o. : https://www.metacentrum.cz/en/
// Submitted by Zdeněk Šustr <zdenek.sustr@cesnet.cz>
*.cloud.metacentrum.cz
custom.metacentrum.cz

// MetaCentrum, CESNET z.s.p.o. : https://www.metacentrum.cz/en/
// Submitted by Radim Janča <janca@cesnet.cz>
flt.cloud.muni.cz
usr.cloud.muni.cz

// Meteor Development Group : https://www.meteor.com/hosting
// Submitted by Pierre Carrier <pierre@meteor.com>
meteorapp.com
eu.meteorapp.com

// Michau Enterprises Limited : http://www.co.pl/
co.pl

// Microsoft Corporation : http://microsoft.com
// Submitted by Public Suffix List Admin <msftpsladmin@microsoft.com>
*.azurecontainer.io
azurewebsites.net
azure-mobile.net
cloudapp.net
azurestaticapps.net
1.azurestaticapps.net
2.azurestaticapps.net
3.azurestaticapps.net
centralus.azurestaticapps.net
eastasia.azurestaticapps.net
eastus2.azurestaticapps.net
westeurope.azurestaticapps.net
westus2.azurestaticapps.net

// minion.systems : http://minion.systems
// Submitted by Robert Böttinger <r@minion.systems>
csx.cc

// Mintere : https://mintere.com/
// Submitted by Ben Aubin <security@mintere.com>
mintere.site

// MobileEducation, LLC : https://joinforte.com
// Submitted by Grayson Martin <grayson.martin@mobileeducation.us>
forte.id

// Mozilla Corporation : https://mozilla.com
// Submitted by Ben Francis <bfrancis@mozilla.com>
mozilla-iot.org

// Mozilla Foundation : https://mozilla.org/
// Submitted by glob <glob@mozilla.com>
bmoattachments.org

// MSK-IX : https://www.msk-ix.ru/
// Submitted by Khannanov Roman <r.khannanov@msk-ix.ru>
net.ru
org.ru
pp.ru

// Mythic Beasts : https://www.mythic-beasts.com
// Submitted by Paul Cammish <kelduum@mythic-beasts.com>
hostedpi.com
customer.mythic-beasts.com
caracal.mythic-beasts.com
fentiger.mythic-beasts.com
lynx.mythic-beasts.com
ocelot.mythic-beasts.com
oncilla.mythic-beasts.com
onza.mythic-beasts.com
sphinx.mythic-beasts.com
vs.mythic-beasts.com
x.mythic-beasts.com
yali.mythic-beasts.com
cust.retrosnub.co.uk

// Nabu Casa : https://www.nabucasa.com
// Submitted by Paulus Schoutsen <infra@nabucasa.com>
ui.nabu.casa

// Net at Work Gmbh : https://www.netatwork.de
// Submitted by Jan Jaeschke <jan.jaeschke@netatwork.de>
cloud.nospamproxy.com

// Netlify : https://www.netlify.com
// Submitted by Jessica Parsons <jessica@netlify.com>
netlify.app

// Neustar Inc.
// Submitted by Trung Tran <Trung.Tran@neustar.biz>
4u.com

// ngrok : https://ngrok.com/
// Submitted by Alan Shreve <alan@ngrok.com>
ngrok.app
ngrok-free.app
ngrok.dev
ngrok-free.dev
ngrok.io
ap.ngrok.io
au.ngrok.io
eu.ngrok.io
in.ngrok.io
jp.ngrok.io
sa.ngrok.io
us.ngrok.io
ngrok.pizza

// Nimbus Hosting Ltd. : https://www.nimbushosting.co.uk/
// Submitted by Nicholas Ford <nick@nimbushosting.co.uk>
nh-serv.co.uk

// NFSN, Inc. : https://www.NearlyFreeSpeech.NET/
// Submitted by Jeff Wheelhouse <support@nearlyfreespeech.net>
nfshost.com

// Noop : https://noop.app
// Submitted by Nathaniel Schweinberg <noop@rearc.io>
*.developer.app
noop.app

// Northflank Ltd. : https://northflank.com/
// Submitted by Marco Suter <marco@northflank.com>
*.northflank.app
*.build.run
*.code.run
*.database.run
*.migration.run

// Noticeable : https://noticeable.io
// Submitted by Laurent Pellegrino <security@noticeable.io>
noticeable.news

// Now-DNS : https://now-dns.com
// Submitted by Steve Russell <steve@now-dns.com>
dnsking.ch
mypi.co
n4t.co
001www.com
ddnslive.com
myiphost.com
forumz.info
16-b.it
32-b.it
64-b.it
soundcast.me
tcp4.me
dnsup.net
hicam.net
now-dns.net
ownip.net
vpndns.net
dynserv.org
now-dns.org
x443.pw
now-dns.top
ntdll.top
freeddns.us
crafting.xyz
zapto.xyz

// nsupdate.info : https://www.nsupdate.info/
// Submitted by Thomas Waldmann <info@nsupdate.info>
nsupdate.info
nerdpol.ovh

// No-IP.com : https://noip.com/
// Submitted by Deven Reza <publicsuffixlist@noip.com>
blogsyte.com
brasilia.me
cable-modem.org
ciscofreak.com
collegefan.org
couchpotatofries.org
damnserver.com
ddns.me
ditchyourip.com
dnsfor.me
dnsiskinky.com
dvrcam.info
dynns.com
eating-organic.net
fantasyleague.cc
geekgalaxy.com
golffan.us
health-carereform.com
homesecuritymac.com
homesecuritypc.com
hopto.me
ilovecollege.info
loginto.me
mlbfan.org
mmafan.biz
myactivedirectory.com
mydissent.net
myeffect.net
mymediapc.net
mypsx.net
mysecuritycamera.com
mysecuritycamera.net
mysecuritycamera.org
net-freaks.com
nflfan.org
nhlfan.net
no-ip.ca
no-ip.co.uk
no-ip.net
noip.us
onthewifi.com
pgafan.net
point2this.com
pointto.us
privatizehealthinsurance.net
quicksytes.com
read-books.org
securitytactics.com
serveexchange.com
servehumour.com
servep2p.com
servesarcasm.com
stufftoread.com
ufcfan.org
unusualperson.com
workisboring.com
3utilities.com
bounceme.net
ddns.net
ddnsking.com
gotdns.ch
hopto.org
myftp.biz
myftp.org
myvnc.com
no-ip.biz
no-ip.info
no-ip.org
noip.me
redirectme.net
servebeer.com
serveblog.net
servecounterstrike.com
serveftp.com
servegame.com
servehalflife.com
servehttp.com
serveirc.com
serveminecraft.net
servemp3.com
servepics.com
servequake.com
sytes.net
webhop.me
zapto.org

// NodeArt : https://nodeart.io
// Submitted by Konstantin Nosov <Nosov@nodeart.io>
stage.nodeart.io

// Nucleos Inc. : https://nucleos.com
// Submitted by Piotr Zduniak <piotr@nucleos.com>
pcloud.host

// NYC.mn : http://www.information.nyc.mn
// Submitted by Matthew Brown <mattbrown@nyc.mn>
nyc.mn

// Observable, Inc. : https://observablehq.com
// Submitted by Mike Bostock <dns@observablehq.com>
static.observableusercontent.com

// Octopodal Solutions, LLC. : https://ulterius.io/
// Submitted by Andrew Sampson <andrew@ulterius.io>
cya.gg

// OMG.LOL : <https://omg.lol>
// Submitted by Adam Newbold <adam@omg.lol>
omg.lol

// Omnibond Systems, LLC. : https://www.omnibond.com
// Submitted by Cole Estep <cole@omnibond.com>
cloudycluster.net

// OmniWe Limited: https://omniwe.com
// Submitted by Vicary Archangel <vicary@omniwe.com>
omniwe.site

// One.com: https://www.one.com/
// Submitted by Jacob Bunk Nielsen <jbn@one.com>
123hjemmeside.dk
123hjemmeside.no
123homepage.it
123kotisivu.fi
123minsida.se
123miweb.es
123paginaweb.pt
123sait.ru
123siteweb.fr
123webseite.at
123webseite.de
123website.be
123website.ch
123website.lu
123website.nl
service.one
simplesite.com
simplesite.com.br
simplesite.gr
simplesite.pl

// One Fold Media : http://www.onefoldmedia.com/
// Submitted by Eddie Jones <eddie@onefoldmedia.com>
nid.io

// Open Social : https://www.getopensocial.com/
// Submitted by Alexander Varwijk <security@getopensocial.com>
opensocial.site

// OpenCraft GmbH : http://opencraft.com/
// Submitted by Sven Marnach <sven@opencraft.com>
opencraft.hosting

// OpenResearch GmbH: https://openresearch.com/
// Submitted by Philipp Schmid <ops@openresearch.com>
orsites.com

// Opera Software, A.S.A.
// Submitted by Yngve Pettersen <yngve@opera.com>
operaunite.com

// Orange : https://www.orange.com
// Submitted by Alexandre Linte <alexandre.linte@orange.com>
tech.orange

// Oursky Limited : https://authgear.com/, https://skygear.io/
// Submitted by Authgear Team <hello@authgear.com>, Skygear Developer <hello@skygear.io>
authgear-staging.com
authgearapps.com
skygearapp.com

// OutSystems
// Submitted by Duarte Santos <domain-admin@outsystemscloud.com>
outsystemscloud.com

// OVHcloud: https://ovhcloud.com
// Submitted by Vincent Cassé <vincent.casse@ovhcloud.com>
*.webpaas.ovh.net
*.hosting.ovh.net

// OwnProvider GmbH: http://www.ownprovider.com
// Submitted by Jan Moennich <jan.moennich@ownprovider.com>
ownprovider.com
own.pm

// OwO : https://whats-th.is/
// Submitted by Dean Sheather <dean@deansheather.com>
*.owo.codes

// OX : http://www.ox.rs
// Submitted by Adam Grand <webmaster@mail.ox.rs>
ox.rs

// oy.lc
// Submitted by Charly Coste <changaco@changaco.oy.lc>
oy.lc

// Pagefog : https://pagefog.com/
// Submitted by Derek Myers <derek@pagefog.com>
pgfog.com

// Pagefront : https://www.pagefronthq.com/
// Submitted by Jason Kriss <jason@pagefronthq.com>
pagefrontapp.com

// PageXL : https://pagexl.com
// Submitted by Yann Guichard <yann@pagexl.com>
pagexl.com

// Paywhirl, Inc : https://paywhirl.com/
// Submitted by Daniel Netzer <dan@paywhirl.com>
*.paywhirl.com

// pcarrier.ca Software Inc: https://pcarrier.ca/
// Submitted by Pierre Carrier <pc@rrier.ca>
bar0.net
bar1.net
bar2.net
rdv.to

// .pl domains (grandfathered)
art.pl
gliwice.pl
krakow.pl
poznan.pl
wroc.pl
zakopane.pl

// Pantheon Systems, Inc. : https://pantheon.io/
// Submitted by Gary Dylina <gary@pantheon.io>
pantheonsite.io
gotpantheon.com

// Peplink | Pepwave : http://peplink.com/
// Submitted by Steve Leung <steveleung@peplink.com>
mypep.link

// Perspecta : https://perspecta.com/
// Submitted by Kenneth Van Alstyne <kvanalstyne@perspecta.com>
perspecta.cloud

// PE Ulyanov Kirill Sergeevich : https://airy.host
// Submitted by Kirill Ulyanov <k.ulyanov@airy.host>
lk3.ru

// Planet-Work : https://www.planet-work.com/
// Submitted by Frédéric VANNIÈRE <f.vanniere@planet-work.com>
on-web.fr

// Platform.sh : https://platform.sh
// Submitted by Nikola Kotur <nikola@platform.sh>
bc.platform.sh
ent.platform.sh
eu.platform.sh
us.platform.sh
*.platformsh.site
*.tst.site

// Platter: https://platter.dev
// Submitted by Patrick Flor <patrick@platter.dev>
platter-app.com
platter-app.dev
platterp.us

// Plesk : https://www.plesk.com/
// Submitted by Anton Akhtyamov <program-managers@plesk.com>
pdns.page
plesk.page
pleskns.com

// Port53 : https://port53.io/
// Submitted by Maximilian Schieder <maxi@zeug.co>
dyn53.io

// Porter : https://porter.run/
// Submitted by Rudraksh MK <rudi@porter.run>
onporter.run

// Positive Codes Technology Company : http://co.bn/faq.html
// Submitted by Zulfais <pc@co.bn>
co.bn

// Postman, Inc : https://postman.com
// Submitted by Rahul Dhawan <security@postman.com>
postman-echo.com
pstmn.io
mock.pstmn.io
httpbin.org

//prequalifyme.today : https://prequalifyme.today
//Submitted by DeepakTiwari deepak@ivylead.io
prequalifyme.today

// prgmr.com : https://prgmr.com/
// Submitted by Sarah Newman <owner@prgmr.com>
xen.prgmr.com

// priv.at : http://www.nic.priv.at/
// Submitted by registry <lendl@nic.at>
priv.at

// privacytools.io : https://www.privacytools.io/
// Submitted by Jonah Aragon <jonah@privacytools.io>
prvcy.page

// Protocol Labs : https://protocol.ai/
// Submitted by Michael Burns <noc@protocol.ai>
*.dweb.link

// Protonet GmbH : http://protonet.io
// Submitted by Martin Meier <admin@protonet.io>
protonet.io

// Publication Presse Communication SARL : https://ppcom.fr
// Submitted by Yaacov Akiba Slama <admin@chirurgiens-dentistes-en-france.fr>
chirurgiens-dentistes-en-france.fr
byen.site

// pubtls.org: https://www.pubtls.org
// Submitted by Kor Nielsen <kor@pubtls.org>
pubtls.org

// PythonAnywhere LLP: https://www.pythonanywhere.com
// Submitted by Giles Thomas <giles@pythonanywhere.com>
pythonanywhere.com
eu.pythonanywhere.com

// QOTO, Org.
// Submitted by Jeffrey Phillips Freeman <jeffrey.freeman@qoto.org>
qoto.io

// Qualifio : https://qualifio.com/
// Submitted by Xavier De Cock <xdecock@gmail.com>
qualifioapp.com

// Quality Unit: https://qualityunit.com
// Submitted by Vasyl Tsalko <vtsalko@qualityunit.com>
ladesk.com

// QuickBackend: https://www.quickbackend.com
// Submitted by Dani Biro <dani@pymet.com>
qbuser.com

// Rad Web Hosting: https://radwebhosting.com
// Submitted by Scott Claeys <s.claeys@radwebhosting.com>
cloudsite.builders

// Redgate Software: https://red-gate.com
// Submitted by Andrew Farries <andrew.farries@red-gate.com>
instances.spawn.cc

// Redstar Consultants : https://www.redstarconsultants.com/
// Submitted by Jons Slemmer <jons@redstarconsultants.com>
instantcloud.cn

// Russian Academy of Sciences
// Submitted by Tech Support <support@rasnet.ru>
ras.ru

// QA2
// Submitted by Daniel Dent (https://www.danieldent.com/)
qa2.com

// QCX
// Submitted by Cassandra Beelen <cassandra@beelen.one>
qcx.io
*.sys.qcx.io

// QNAP System Inc : https://www.qnap.com
// Submitted by Nick Chang <nickchang@qnap.com>
dev-myqnapcloud.com
alpha-myqnapcloud.com
myqnapcloud.com

// Quip : https://quip.com
// Submitted by Patrick Linehan <plinehan@quip.com>
*.quipelements.com

// Qutheory LLC : http://qutheory.io
// Submitted by Jonas Schwartz <jonas@qutheory.io>
vapor.cloud
vaporcloud.io

// Rackmaze LLC : https://www.rackmaze.com
// Submitted by Kirill Pertsev <kika@rackmaze.com>
rackmaze.com
rackmaze.net

// Rakuten Games, Inc : https://dev.viberplay.io
// Submitted by Joshua Zhang <public-suffix@rgames.jp>
g.vbrplsbx.io

// Rancher Labs, Inc : https://rancher.com
// Submitted by Vincent Fiduccia <domains@rancher.com>
*.on-k3s.io
*.on-rancher.cloud
*.on-rio.io

// Read The Docs, Inc : https://www.readthedocs.org
// Submitted by David Fischer <team@readthedocs.org>
readthedocs.io

// Red Hat, Inc. OpenShift : https://openshift.redhat.com/
// Submitted by Tim Kramer <tkramer@rhcloud.com>
rhcloud.com

// Render : https://render.com
// Submitted by Anurag Goel <dev@render.com>
app.render.com
onrender.com

// Repl.it : https://repl.it
// Submitted by Lincoln Bergeson <lincoln@replit.com>
firewalledreplit.co
id.firewalledreplit.co
repl.co
id.repl.co
repl.run

// Resin.io : https://resin.io
// Submitted by Tim Perry <tim@resin.io>
resindevice.io
devices.resinstaging.io

// RethinkDB : https://www.rethinkdb.com/
// Submitted by Chris Kastorff <info@rethinkdb.com>
hzc.io

// Revitalised Limited : http://www.revitalised.co.uk
// Submitted by Jack Price <jack@revitalised.co.uk>
wellbeingzone.eu
wellbeingzone.co.uk

// Rico Developments Limited : https://adimo.co
// Submitted by Colin Brown <hello@adimo.co>
adimo.co.uk

// Riseup Networks : https://riseup.net
// Submitted by Micah Anderson <micah@riseup.net>
itcouldbewor.se

// Rochester Institute of Technology : http://www.rit.edu/
// Submitted by Jennifer Herting <jchits@rit.edu>
git-pages.rit.edu

// Rocky Enterprise Software Foundation : https://resf.org
// Submitted by Neil Hanlon <neil@resf.org>
rocky.page

// Rusnames Limited: http://rusnames.ru/
// Submitted by Sergey Zotov <admin@rusnames.ru>
биз.рус
ком.рус
крым.рус
мир.рус
мск.рус
орг.рус
самара.рус
сочи.рус
спб.рус
я.рус

// SAKURA Internet Inc. : https://www.sakura.ad.jp/
// Submitted by Internet Service Department <rs-vendor-ml@sakura.ad.jp>
180r.com
dojin.com
sakuratan.com
sakuraweb.com
x0.com
2-d.jp
bona.jp
crap.jp
daynight.jp
eek.jp
flop.jp
halfmoon.jp
jeez.jp
matrix.jp
mimoza.jp
ivory.ne.jp
mail-box.ne.jp
mints.ne.jp
mokuren.ne.jp
opal.ne.jp
sakura.ne.jp
sumomo.ne.jp
topaz.ne.jp
netgamers.jp
nyanta.jp
o0o0.jp
rdy.jp
rgr.jp
rulez.jp
s3.isk01.sakurastorage.jp
s3.isk02.sakurastorage.jp
saloon.jp
sblo.jp
skr.jp
tank.jp
uh-oh.jp
undo.jp
rs.webaccel.jp
user.webaccel.jp
websozai.jp
xii.jp
squares.net
jpn.org
kirara.st
x0.to
from.tv
sakura.tv

// Salesforce.com, Inc. https://salesforce.com/
// Submitted by Michael Biven <mbiven@salesforce.com>
*.builder.code.com
*.dev-builder.code.com
*.stg-builder.code.com

// Sandstorm Development Group, Inc. : https://sandcats.io/
// Submitted by Asheesh Laroia <asheesh@sandstorm.io>
sandcats.io

// SBE network solutions GmbH : https://www.sbe.de/
// Submitted by Norman Meilick <nm@sbe.de>
logoip.de
logoip.com

// Scaleway : https://www.scaleway.com/
// Submitted by Rémy Léone <rleone@scaleway.com>
fr-par-1.baremetal.scw.cloud
fr-par-2.baremetal.scw.cloud
nl-ams-1.baremetal.scw.cloud
fnc.fr-par.scw.cloud
functions.fnc.fr-par.scw.cloud
k8s.fr-par.scw.cloud
nodes.k8s.fr-par.scw.cloud
s3.fr-par.scw.cloud
s3-website.fr-par.scw.cloud
whm.fr-par.scw.cloud
priv.instances.scw.cloud
pub.instances.scw.cloud
k8s.scw.cloud
k8s.nl-ams.scw.cloud
nodes.k8s.nl-ams.scw.cloud
s3.nl-ams.scw.cloud
s3-website.nl-ams.scw.cloud
whm.nl-ams.scw.cloud
k8s.pl-waw.scw.cloud
nodes.k8s.pl-waw.scw.cloud
s3.pl-waw.scw.cloud
s3-website.pl-waw.scw.cloud
scalebook.scw.cloud
smartlabeling.scw.cloud
dedibox.fr

// schokokeks.org GbR : https://schokokeks.org/
// Submitted by Hanno Böck <hanno@schokokeks.org>
schokokeks.net

// Scottish Government: https://www.gov.scot
// Submitted by Martin Ellis <martin.ellis@gov.scot>
gov.scot
service.gov.scot

// Scry Security : http://www.scrysec.com
// Submitted by Shante Adam <shante@skyhat.io>
scrysec.com

// Securepoint GmbH : https://www.securepoint.de
// Submitted by Erik Anders <erik.anders@securepoint.de>
firewall-gateway.com
firewall-gateway.de
my-gateway.de
my-router.de
spdns.de
spdns.eu
firewall-gateway.net
my-firewall.org
myfirewall.org
spdns.org

// Seidat : https://www.seidat.com
// Submitted by Artem Kondratev <accounts@seidat.com>
seidat.net

// Sellfy : https://sellfy.com
// Submitted by Yuriy Romadin <contact@sellfy.com>
sellfy.store

// Senseering GmbH : https://www.senseering.de
// Submitted by Felix Mönckemeyer <f.moenckemeyer@senseering.de>
senseering.net

// Sendmsg: https://www.sendmsg.co.il
// Submitted by Assaf Stern <domains@comstar.co.il>
minisite.ms

// Service Magnet : https://myservicemagnet.com
// Submitted by Dave Sanders <dave@myservicemagnet.com>
magnet.page

// Service Online LLC : http://drs.ua/
// Submitted by Serhii Bulakh <support@drs.ua>
biz.ua
co.ua
pp.ua

// Shift Crypto AG : https://shiftcrypto.ch
// Submitted by alex <alex@shiftcrypto.ch>
shiftcrypto.dev
shiftcrypto.io

// ShiftEdit : https://shiftedit.net/
// Submitted by Adam Jimenez <adam@shiftcreate.com>
shiftedit.io

// Shopblocks : http://www.shopblocks.com/
// Submitted by Alex Bowers <alex@shopblocks.com>
myshopblocks.com

// Shopify : https://www.shopify.com
// Submitted by Alex Richter <alex.richter@shopify.com>
myshopify.com

// Shopit : https://www.shopitcommerce.com/
// Submitted by Craig McMahon <craig@shopitcommerce.com>
shopitsite.com

// shopware AG : https://shopware.com
// Submitted by Jens Küper <cloud@shopware.com>
shopware.store

// Siemens Mobility GmbH
// Submitted by Oliver Graebner <security@mo-siemens.io>
mo-siemens.io

// SinaAppEngine : http://sae.sina.com.cn/
// Submitted by SinaAppEngine <saesupport@sinacloud.com>
1kapp.com
appchizi.com
applinzi.com
sinaapp.com
vipsinaapp.com

// Siteleaf : https://www.siteleaf.com/
// Submitted by Skylar Challand <support@siteleaf.com>
siteleaf.net

// Skyhat : http://www.skyhat.io
// Submitted by Shante Adam <shante@skyhat.io>
bounty-full.com
alpha.bounty-full.com
beta.bounty-full.com

// Smallregistry by Promopixel SARL: https://www.smallregistry.net
// Former AFNIC's SLDs 
// Submitted by Jérôme Lipowicz <support@promopixel.com>
aeroport.fr
avocat.fr
chambagri.fr
chirurgiens-dentistes.fr
experts-comptables.fr
medecin.fr
notaires.fr
pharmacien.fr
port.fr
veterinaire.fr

// Small Technology Foundation : https://small-tech.org
// Submitted by Aral Balkan <aral@small-tech.org>
small-web.org

// Smoove.io : https://www.smoove.io/
// Submitted by Dan Kozak <dan@smoove.io>
vp4.me

// Snowflake Inc : https://www.snowflake.com/
// Submitted by Faith Olapade <faith.olapade@snowflake.com>
snowflake.app
privatelink.snowflake.app
streamlit.app
streamlitapp.com

// Snowplow Analytics : https://snowplowanalytics.com/
// Submitted by Ian Streeter <ian@snowplowanalytics.com>
try-snowplow.com

// SourceHut : https://sourcehut.org
// Submitted by Drew DeVault <sir@cmpwn.com>
srht.site

// Stackhero : https://www.stackhero.io
// Submitted by Adrien Gillon <adrien+public-suffix-list@stackhero.io>
stackhero-network.com

// Staclar : https://staclar.com
// Submitted by Q Misell <q@staclar.com>
musician.io
// Submitted by Matthias Merkel <matthias.merkel@staclar.com>
novecore.site

// staticland : https://static.land
// Submitted by Seth Vincent <sethvincent@gmail.com>
static.land
dev.static.land
sites.static.land

// Storebase : https://www.storebase.io
// Submitted by Tony Schirmer <tony@storebase.io>
storebase.store

// Strategic System Consulting (eApps Hosting): https://www.eapps.com/
// Submitted by Alex Oancea <aoancea@cloudscale365.com>
vps-host.net
atl.jelastic.vps-host.net
njs.jelastic.vps-host.net
ric.jelastic.vps-host.net

// Sony Interactive Entertainment LLC : https://sie.com/
// Submitted by David Coles <david.coles@sony.com>
playstation-cloud.com

// SourceLair PC : https://www.sourcelair.com
// Submitted by Antonis Kalipetis <akalipetis@sourcelair.com>
apps.lair.io
*.stolos.io

// SpaceKit : https://www.spacekit.io/
// Submitted by Reza Akhavan <spacekit.io@gmail.com>
spacekit.io

// SpeedPartner GmbH: https://www.speedpartner.de/
// Submitted by Stefan Neufeind <info@speedpartner.de>
customer.speedpartner.de

// Spreadshop (sprd.net AG) : https://www.spreadshop.com/
// Submitted by Martin Breest <security@spreadshop.com>
myspreadshop.at
myspreadshop.com.au
myspreadshop.be
myspreadshop.ca
myspreadshop.ch
myspreadshop.com
myspreadshop.de
myspreadshop.dk
myspreadshop.es
myspreadshop.fi
myspreadshop.fr
myspreadshop.ie
myspreadshop.it
myspreadshop.net
myspreadshop.nl
myspreadshop.no
myspreadshop.pl
myspreadshop.se
myspreadshop.co.uk

// Standard Library : https://stdlib.com
// Submitted by Jacob Lee <jacob@stdlib.com>
api.stdlib.com

// Storipress : https://storipress.com
// Submitted by Benno Liu <benno@storipress.com>
storipress.app

// Storj Labs Inc. : https://storj.io/
// Submitted by Philip Hutchins <hostmaster@storj.io>
storj.farm

// Studenten Net Twente : http://www.snt.utwente.nl/
// Submitted by Silke Hofstra <syscom@snt.utwente.nl>
utwente.io

// Student-Run Computing Facility : https://www.srcf.net/
// Submitted by Edwin Balani <sysadmins@srcf.net>
soc.srcf.net
user.srcf.net

// Sub 6 Limited: http://www.sub6.com
// Submitted by Dan Miller <dm@sub6.com>
temp-dns.com

// Supabase : https://supabase.io
// Submitted by Inian Parameshwaran <security@supabase.io>
supabase.co
supabase.in
supabase.net
su.paba.se

// Symfony, SAS : https://symfony.com/
// Submitted by Fabien Potencier <fabien@symfony.com>
*.s5y.io
*.sensiosite.cloud

// Syncloud : https://syncloud.org
// Submitted by Boris Rybalkin <syncloud@syncloud.it>
syncloud.it

// Synology, Inc. : https://www.synology.com/
// Submitted by Rony Weng <ronyweng@synology.com>
dscloud.biz
direct.quickconnect.cn
dsmynas.com
familyds.com
diskstation.me
dscloud.me
i234.me
myds.me
synology.me
dscloud.mobi
dsmynas.net
familyds.net
dsmynas.org
familyds.org
vpnplus.to
direct.quickconnect.to

// Tabit Technologies Ltd. : https://tabit.cloud/
// Submitted by Oren Agiv <oren@tabit.cloud>
tabitorder.co.il
mytabit.co.il
mytabit.com

// TAIFUN Software AG : http://taifun-software.de
// Submitted by Bjoern Henke <dev-server@taifun-software.de>
taifun-dns.de

// Tailscale Inc. : https://www.tailscale.com
// Submitted by David Anderson <danderson@tailscale.com>
beta.tailscale.net
ts.net

// TASK geographical domains (www.task.gda.pl/uslugi/dns)
gda.pl
gdansk.pl
gdynia.pl
med.pl
sopot.pl

// team.blue https://team.blue
// Submitted by Cedric Dubois <cedric.dubois@team.blue>
site.tb-hosting.com

// Teckids e.V. : https://www.teckids.org
// Submitted by Dominik George <dominik.george@teckids.org>
edugit.io
s3.teckids.org

// Telebit : https://telebit.cloud
// Submitted by AJ ONeal <aj@telebit.cloud>
telebit.app
telebit.io
*.telebit.xyz

// Thingdust AG : https://thingdust.com/
// Submitted by Adrian Imboden <adi@thingdust.com>
*.firenet.ch
*.svc.firenet.ch
reservd.com
thingdustdata.com
cust.dev.thingdust.io
cust.disrec.thingdust.io
cust.prod.thingdust.io
cust.testing.thingdust.io
reservd.dev.thingdust.io
reservd.disrec.thingdust.io
reservd.testing.thingdust.io

// ticket i/O GmbH : https://ticket.io
// Submitted by Christian Franke <it@ticket.io>
tickets.io

// Tlon.io : https://tlon.io
// Submitted by Mark Staarink <mark@tlon.io>
arvo.network
azimuth.network
tlon.network

// Tor Project, Inc. : https://torproject.org
// Submitted by Antoine Beaupré <anarcat@torproject.org
torproject.net
pages.torproject.net

// TownNews.com : http://www.townnews.com
// Submitted by Dustin Ward <dward@townnews.com>
bloxcms.com
townnews-staging.com

// TrafficPlex GmbH : https://www.trafficplex.de/
// Submitted by Phillipp Röll <phillipp.roell@trafficplex.de>
12hp.at
2ix.at
4lima.at
lima-city.at
12hp.ch
2ix.ch
4lima.ch
lima-city.ch
trafficplex.cloud
de.cool
12hp.de
2ix.de
4lima.de
lima-city.de
1337.pictures
clan.rip
lima-city.rocks
webspace.rocks
lima.zone

// TransIP : https://www.transip.nl
// Submitted by Rory Breuk <rbreuk@transip.nl>
*.transurl.be
*.transurl.eu
*.transurl.nl

// TransIP: https://www.transip.nl
// Submitted by Cedric Dubois <cedric.dubois@team.blue>
site.transip.me

// TuxFamily : http://tuxfamily.org
// Submitted by TuxFamily administrators <adm@staff.tuxfamily.org>
tuxfamily.org

// TwoDNS : https://www.twodns.de/
// Submitted by TwoDNS-Support <support@two-dns.de>
dd-dns.de
diskstation.eu
diskstation.org
dray-dns.de
draydns.de
dyn-vpn.de
dynvpn.de
mein-vigor.de
my-vigor.de
my-wan.de
syno-ds.de
synology-diskstation.de
synology-ds.de

// Typedream : https://typedream.com
// Submitted by Putri Karunia <putri@typedream.com>
typedream.app

// Typeform : https://www.typeform.com
// Submitted by Sergi Ferriz <sergi.ferriz@typeform.com>
pro.typeform.com

// Uberspace : https://uberspace.de
// Submitted by Moritz Werner <mwerner@jonaspasche.com>
uber.space
*.uberspace.de

// UDR Limited : http://www.udr.hk.com
// Submitted by registry <hostmaster@udr.hk.com>
hk.com
hk.org
ltd.hk
inc.hk

// UK Intis Telecom LTD : https://it.com
// Submitted by ITComdomains <to@it.com>
it.com

// UNIVERSAL DOMAIN REGISTRY : https://www.udr.org.yt/
// see also: whois -h whois.udr.org.yt help
// Submitted by Atanunu Igbunuroghene <publicsuffixlist@udr.org.yt>
name.pm
sch.tf
biz.wf
sch.wf
org.yt

// United Gameserver GmbH : https://united-gameserver.de
// Submitted by Stefan Schwarz <sysadm@united-gameserver.de>
virtualuser.de
virtual-user.de

// Upli : https://upli.io
// Submitted by Lenny Bakkalian <lenny.bakkalian@gmail.com>
upli.io

// urown.net : https://urown.net
// Submitted by Hostmaster <hostmaster@urown.net>
urown.cloud
dnsupdate.info

// .US
// Submitted by Ed Moore <Ed.Moore@lib.de.us>
lib.de.us

// VeryPositive SIA : http://very.lv
// Submitted by Danko Aleksejevs <danko@very.lv>
2038.io

// Vercel, Inc : https://vercel.com/
// Submitted by Connor Davis <security@vercel.com>
vercel.app
vercel.dev
now.sh

// Viprinet Europe GmbH : http://www.viprinet.com
// Submitted by Simon Kissel <hostmaster@viprinet.com>
router.management

// Virtual-Info : https://www.virtual-info.info/
// Submitted by Adnan RIHAN <hostmaster@v-info.info>
v-info.info

// Voorloper.com: https://voorloper.com
// Submitted by Nathan van Bakel <info@voorloper.com>
voorloper.cloud

// Voxel.sh DNS : https://voxel.sh/dns/
// Submitted by Mia Rehlinger <dns@voxel.sh>
neko.am
nyaa.am
be.ax
cat.ax
es.ax
eu.ax
gg.ax
mc.ax
us.ax
xy.ax
nl.ci
xx.gl
app.gp
blog.gt
de.gt
to.gt
be.gy
cc.hn
blog.kg
io.kg
jp.kg
tv.kg
uk.kg
us.kg
de.ls
at.md
de.md
jp.md
to.md
indie.porn
vxl.sh
ch.tc
me.tc
we.tc
nyan.to
at.vg
blog.vu
dev.vu
me.vu

// V.UA Domain Administrator : https://domain.v.ua/
// Submitted by Serhii Rostilo <sergey@rostilo.kiev.ua>
v.ua

// Vultr Objects : https://www.vultr.com/products/object-storage/
// Submitted by Niels Maumenee <storage@vultr.com>
*.vultrobjects.com

// Waffle Computer Inc., Ltd. : https://docs.waffleinfo.com
// Submitted by Masayuki Note <masa@blade.wafflecell.com>
wafflecell.com

// WebHare bv: https://www.webhare.com/
// Submitted by Arnold Hendriks <info@webhare.com>
*.webhare.dev

// WebHotelier Technologies Ltd: https://www.webhotelier.net/
// Submitted by Apostolos Tsakpinis <apostolos.tsakpinis@gmail.com>
reserve-online.net
reserve-online.com
bookonline.app
hotelwithflight.com

// WeDeploy by Liferay, Inc. : https://www.wedeploy.com
// Submitted by Henrique Vicente <security@wedeploy.com>
wedeploy.io
wedeploy.me
wedeploy.sh

// Western Digital Technologies, Inc : https://www.wdc.com
// Submitted by Jung Jin <jungseok.jin@wdc.com>
remotewd.com

// WIARD Enterprises : https://wiardweb.com
// Submitted by Kidd Hustle <kiddhustle@wiardweb.com>
pages.wiardweb.com

// Wikimedia Labs : https://wikitech.wikimedia.org
// Submitted by Arturo Borrero Gonzalez <aborrero@wikimedia.org>
wmflabs.org
toolforge.org
wmcloud.org

// WISP : https://wisp.gg
// Submitted by Stepan Fedotov <stepan@wisp.gg>
panel.gg
daemon.panel.gg

// Wizard Zines : https://wizardzines.com
// Submitted by Julia Evans <julia@wizardzines.com>
messwithdns.com

// WoltLab GmbH : https://www.woltlab.com
// Submitted by Tim Düsterhus <security@woltlab.cloud>
woltlab-demo.com
myforum.community
community-pro.de
diskussionsbereich.de
community-pro.net
meinforum.net

// Woods Valldata : https://www.woodsvalldata.co.uk/
// Submitted by Chris Whittle <chris.whittle@woodsvalldata.co.uk>
affinitylottery.org.uk
raffleentry.org.uk
weeklylottery.org.uk

// WP Engine : https://wpengine.com/
// Submitted by Michael Smith <michael.smith@wpengine.com>
// Submitted by Brandon DuRette <brandon.durette@wpengine.com>
wpenginepowered.com
js.wpenginepowered.com

// Wix.com, Inc. : https://www.wix.com
// Submitted by Shahar Talmi <shahar@wix.com>
wixsite.com
editorx.io
wixstudio.io
wix.run

// XenonCloud GbR: https://xenoncloud.net
// Submitted by Julian Uphoff <publicsuffixlist@xenoncloud.net>
half.host

// XnBay Technology : http://www.xnbay.com/
// Submitted by XnBay Developer <developer.xncloud@gmail.com>
xnbay.com
u2.xnbay.com
u2-local.xnbay.com

// XS4ALL Internet bv : https://www.xs4all.nl/
// Submitted by Daniel Mostertman <unixbeheer+publicsuffix@xs4all.net>
cistron.nl
demon.nl
xs4all.space

// Yandex.Cloud LLC: https://cloud.yandex.com
// Submitted by Alexander Lodin <security+psl@yandex-team.ru>
yandexcloud.net
storage.yandexcloud.net
website.yandexcloud.net

// YesCourse Pty Ltd : https://yescourse.com
// Submitted by Atul Bhouraskar <atul@yescourse.com>
official.academy

// Yola : https://www.yola.com/
// Submitted by Stefano Rivera <stefano@yola.com>
yolasite.com

// Yombo : https://yombo.net
// Submitted by Mitch Schwenk <mitch@yombo.net>
ybo.faith
yombo.me
homelink.one
ybo.party
ybo.review
ybo.science
ybo.trade

// Yunohost : https://yunohost.org
// Submitted by Valentin Grimaud <security@yunohost.org>
ynh.fr
nohost.me
noho.st

// ZaNiC : http://www.za.net/
// Submitted by registry <hostmaster@nic.za.net>
za.net
za.org

// Zine EOOD : https://zine.bg/
// Submitted by Martin Angelov <martin@zine.bg>
bss.design

// Zitcom A/S : https://www.zitcom.dk
// Submitted by Emil Stahl <esp@zitcom.dk>
basicserver.io
virtualserver.io
enterprisecloud.nu

// ===END PRIVATE DOMAINS===
`.split("\n").filter(line => !line.startsWith("//") && line.trim().length > 0).sort((lineLeft, lineRight) => lineRight.length - lineLeft.length);

export { formatFilename, evalTemplate };

async function formatFilename(content, doc, options) {
	let filename = (await evalTemplate(options.filenameTemplate, options, content, doc)) || "";
	filename = filename.trim();
	if (options.replaceEmojisInFilename) {
		EMOJIS.forEach(emoji => (filename = replaceAll(filename, emoji, " _" + EMOJI_NAMES[emoji] + "_ ")));
	}
	const { filenameReplacementCharacter, filenameReplacedCharacters, filenameReplacementCharacters } = options;
	filename = getValidFilename(filename, filenameReplacedCharacters, filenameReplacementCharacter, filenameReplacementCharacters);
	if (!options.backgroundSave) {
		filename = filename.replace(/\//g, filenameReplacementCharacter);
	}
	if (!options.keepFilename && ((options.filenameMaxLengthUnit == "bytes" && getContentSize(filename) > options.filenameMaxLength) || filename.length > options.filenameMaxLength)) {
		const extensionMatch = filename.match(/(\.[^.]{3,4})$/);
		const extension = extensionMatch && extensionMatch[0] && extensionMatch[0].length > 1 ? extensionMatch[0] : "";
		filename = options.filenameMaxLengthUnit == "bytes" ? await truncateText(filename, options.filenameMaxLength - extension.length) : filename.substring(0, options.filenameMaxLength - extension.length);
		filename = filename + "…" + extension;
	}
	if (!filename) {
		filename = "Unnamed page";
	}
	if (filename.startsWith(".")) {
		filename = "Unnamed page" + filename;
	}
	return filename.trim();
}

async function evalTemplate(template = "", options, content, doc, context = {}) {
	const { dontReplaceSlash } = context;
	context.currentDate = new Date();
	const url = new URL(options.saveUrl || options.url);
	const urlHref = decode(url.href);
	const params = Array.from(new URLSearchParams(url.search));
	const bookmarkFolder = (options.bookmarkFolders && options.bookmarkFolders.join("/")) || "";
	const dontReplaceSlashIfUndefined = dontReplaceSlash === undefined ? true : dontReplaceSlash;
	const urlSuffix = PUBLIC_SUFFIX_LIST.find(urlTopLevelDomainName => url.hostname.endsWith("." + urlTopLevelDomainName) && urlTopLevelDomainName);
	const urlDomainName = urlSuffix ? url.hostname.substring(0, url.hostname.length - urlSuffix.length - 1) : url.hostname;
	const indexLastDotCharacter = urlDomainName.lastIndexOf(".");
	let urlSubDomains = urlDomainName.substring(0, indexLastDotCharacter == -1 ? 0 : indexLastDotCharacter);
	const urlDomain = urlDomainName.substring(urlSubDomains.length ? urlSubDomains.length + 1 : 0);
	const urlRoot = urlDomain + "." + urlSuffix;
	if (urlSubDomains.startsWith("www.")) {
		urlSubDomains = urlSubDomains.substring(4);
	} else if (urlSubDomains == "www") {
		urlSubDomains = "";
	}
	const variables = {
		"navigator-language": { getter: () => navigator.language },
		"page-title": { getter: () => options.title },
		"page-heading": { getter: () => options.info.heading },
		"page-language": { getter: () => options.info.lang },
		"page-description": { getter: () => options.info.description },
		"page-author": { getter: () => options.info.author },
		"page-creator": { getter: () => options.info.creator },
		"page-publisher": { getter: () => options.info.publisher },
		"url-hash": { getter: () => url.hash.substring(1) },
		"url-host": { getter: () => url.host.replace(/\/$/, "") },
		"url-hostname": { getter: () => url.hostname.replace(/\/$/, "") },
		"url-hostname-suffix": { getter: () => urlSuffix },
		"url-hostname-domain": { getter: () => urlDomain },
		"url-hostname-root": { getter: () => urlRoot },
		"url-hostname-subdomains": { getter: () => urlSubDomains },
		"url-href": { getter: () => urlHref, dontReplaceSlash: dontReplaceSlashIfUndefined },
		"url-href-digest-sha-1": { getter: urlHref ? async () => digest("SHA-1", urlHref) : "" },
		"url-href-flat": { getter: () => decode(url.href), dontReplaceSlash: false },
		"url-referrer": { getter: () => decode(options.referrer), dontReplaceSlash: dontReplaceSlashIfUndefined },
		"url-referrer-flat": { getter: () => decode(options.referrer), dontReplaceSlash: false },
		"url-password": { getter: () => url.password },
		"url-pathname": { getter: () => decode(url.pathname).replace(/^\//, "").replace(/\/$/, ""), dontReplaceSlash: dontReplaceSlashIfUndefined },
		"url-pathname-flat": { getter: () => decode(url.pathname), dontReplaceSlash: false },
		"url-port": { getter: () => url.port },
		"url-protocol": { getter: () => url.protocol },
		"url-search": { getter: () => url.search.substring(1) },
		"url-username": { getter: () => url.username },
		"url-original": { getter: () => options.originalUrl },
		"tab-id": { getter: () => String(options.tabId) },
		"tab-index": { getter: () => String(options.tabIndex) },
		"url-last-segment": { getter: () => decode(getLastSegment(url, options.filenameReplacementCharacter)) },
		"bookmark-pathname": { getter: () => bookmarkFolder, dontReplaceSlash: dontReplaceSlashIfUndefined },
		"bookmark-pathname-flat": { getter: () => bookmarkFolder, dontReplaceSlash: false },
		"profile-name": { getter: () => options.profileName },
		"filename-extension": { getter: () => getFilenameExtension(options) },
		"save-action": { getter: () => options.selected ? "selection" : "page" },
		"options-json": { getter: () => JSON.stringify(getFilteredOptions(options)) },
		"options-text": { getter: () => optionsToText(getFilteredOptions(options)) }
	};
	if (content) {
		variables["digest-sha-256"] = { getter: async () => digest("SHA-256", content) };
		variables["digest-sha-384"] = { getter: async () => digest("SHA-384", content) };
		variables["digest-sha-512"] = { getter: async () => digest("SHA-512", content) };
	}
	if (options.saveDate) {
		addDateVariables(options.saveDate);
	}
	if (options.visitDate) {
		addDateVariables(options.visitDate, "visit-");
	}
	const functions = {
		"if-empty": (...values) => {
			const defaultValue = values.pop();
			const foundValue = values.find(value => value);
			return foundValue ? foundValue : defaultValue;
		},
		"if-not-empty": (...values) => {
			const defaultValue = values.pop();
			const foundValue = values.find(value => value);
			return foundValue ? defaultValue : foundValue;
		},
		"if-equals": (value, otherValue, trueValue, falseValue) => value == otherValue ? trueValue : falseValue,
		"if-not-equals": (value, otherValue, trueValue, falseValue) => value != otherValue ? trueValue : falseValue,
		"if-contains": (value, otherValue, trueValue, falseValue) => otherValue && value.includes(otherValue) ? trueValue : falseValue,
		"if-not-contains": (value, otherValue, trueValue, falseValue) => otherValue && !value.includes(otherValue) ? trueValue : falseValue,
		"substring": (value, start, end) => value.substring(start, end),
		"lowercase": value => value.toLowerCase(),
		"uppercase": value => value.toUpperCase(),
		"capitalize": value => value.charAt(0).toUpperCase() + value.slice(1),
		"replace": (value, searchValue, replaceValue) => searchValue && replaceValue ? replaceAll(value, searchValue, replaceValue) : value,
		"trim": value => value.trim(),
		"trim-left": value => value.trimLeft(),
		"trim-right": value => value.trimRight(),
		"pad-left": (value, length, padString) => length > 0 ? value.padStart(length, padString) : value,
		"pad-right": (value, length, padString) => length > 0 ? value.padEnd(length, padString) : value,
		"repeat": (value, count) => count > 0 ? value.repeat(count) : "",
		"index-of": (value, searchValue, fromIndex) => value.indexOf(searchValue, fromIndex),
		"last-index-of": (value, searchValue, fromIndex) => value.lastIndexOf(searchValue, fromIndex),
		"length": value => value.length,
		"url-search-name": (index = 0) => params[index] && params[index][0],
		"url-search-value": (index = 0) => params[index] && params[index][1],
		"url-search-named-value": name => {
			const param = params.find(param => param[0] == name);
			return (param && param[1]);
		},
		"url-search": name => {
			const param = params.find(param => param[0] == name);
			return (param && param[1]);
		},
		"url-segment": (index = 0) => {
			const segments = decode(url.pathname).split("/");
			segments.pop();
			segments.push(getLastSegment(url, options.filenameReplacementCharacter));
			return segments[index];
		},
		"url-hostname-subdomain": (index = 0) => {
			const subdomains = urlSubDomains.split(".");
			return subdomains[subdomains.length - index - 1];
		},
		// eslint-disable-next-line no-unused-vars
		"stringify": value => { try { return JSON.stringify(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"encode-base64": value => { try { return btoa(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"decode-base64": value => { try { return atob(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"encode-uri": value => { try { return encodeURI(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"decode-uri": value => { try { return decodeURI(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"encode-uri-component": value => { try { return encodeURIComponent(value); } catch (error) { return value; } },
		// eslint-disable-next-line no-unused-vars
		"decode-uri-component": value => { try { return decodeURIComponent(value); } catch (error) { return value; } },
		"date-locale": locales => context.currentDate.toLocaleDateString(locales),
		"time-locale": locales => context.currentDate.toLocaleTimeString(locales),
		"datetime-locale": locales => context.currentDate.toLocaleString(locales),
		"datetime-custom": (locale, year, month, day, weekday, hour, minute, second, hour12, timeZone, fractionalSecondDigits, timeZoneName, dayPeriod, era, localeMatcher) => {
			const date = context.currentDate;
			const options = {};
			setOption(options, "year", year);
			setOption(options, "month", month);
			setOption(options, "day", day);
			setOption(options, "weekday", weekday);
			setOption(options, "hour", hour);
			setOption(options, "minute", minute);
			setOption(options, "second", second);
			setOption(options, "hour12", hour12);
			options.hour12 = hour12 == "true";
			setOption(options, "timeZone", timeZone);
			setOption(options, "fractionalSecondDigits", fractionalSecondDigits);
			setOption(options, "timeZoneName", timeZoneName);
			setOption(options, "dayPeriod", dayPeriod);
			setOption(options, "era", era);
			setOption(options, "localeMatcher", localeMatcher);
			return new Intl.DateTimeFormat(locale, options).format(date);

			function setOption(options, name, value) {
				if (value == " ") {
					options[name] = undefined;
				} else if (value) {
					options[name] = value;
				}
			}
		},
		"option-value": key => {
			const filteredValue = getFilteredOptions(options)[key];
			if (filteredValue === undefined || filteredValue === null) {
				return "";
			} else {
				return JSON.stringify(filteredValue);
			}
		}
	};
	functions["date-locale"].dontReplaceSlash = true;
	functions["time-locale"].dontReplaceSlash = true;
	functions["datetime-locale"].dontReplaceSlash = true;
	functions["datetime-custom"].dontReplaceSlash = true;
	if (doc) {
		functions["page-element-text"] = (selector) => {
			const element = doc.querySelector(selector);
			return element && element.textContent;
		};
		functions["page-element-attribute"] = (selector, attribute) => {
			const element = doc.querySelector(selector);
			return element && element.getAttribute(attribute);
		};
	}
	template = replaceAll(template, "\\%", "\\\\%");
	template = replaceAll(template, "\\{", "\\\\{");
	template = replaceAll(template, "\\|", "\\\\|");
	template = replaceAll(template, "\\>", "\\\\>");
	let result = (await parse(template, {
		async callFunction(name, [argument, optionalArguments], lengthData) {
			const fn = functions[name];
			if (fn) {
				argument = argument.replace(/\\\\(.)/g, "$1");
				if (!optionalArguments) {
					optionalArguments = [];
				}
				optionalArguments = optionalArguments
					.map(argument => argument.replace(/\\\\(.)/g, "$1"))
					.filter(argument => argument != undefined && argument != null)
					.map(argument => argument == "" ? undefined : argument);
				if ((argument != undefined && argument != null && argument != "") || optionalArguments.length > 0) {
					try {
						const dontReplaceSlash = fn.dontReplaceSlash === undefined ? true : fn.dontReplaceSlash;
						return await getValue(() => fn(argument, ...optionalArguments), dontReplaceSlash, options.filenameReplacementCharacter, lengthData);
						// eslint-disable-next-line no-unused-vars
					} catch (error) {
						return "";
					}
				} else {
					return "";
				}
			} else {
				return "";
			}
		},
		getVariableValue(name, lengthData) {
			const variable = variables[name];
			if (variable) {
				return getValue(variable.getter, variable.dontReplaceSlash, options.filenameReplacementCharacter, lengthData);
			} else {
				return "";
			}
		}
	}));
	result = replaceAll(result, "\\\\%", "%");
	result = replaceAll(result, "\\\\{", "{");
	result = replaceAll(result, "\\\\|", "|");
	result = replaceAll(result, "\\\\>", ">");
	return result;

	function addDateVariables(date, prefix = "") {
		variables[prefix + "datetime-iso"] = { getter: () => date.toISOString() };
		variables[prefix + "date-iso"] = { getter: () => date.toISOString().split("T")[0] };
		variables[prefix + "time-iso"] = { getter: () => date.toISOString().split("T")[1].split("Z")[0] };
		variables[prefix + "date-locale"] = { getter: () => date.toLocaleDateString() };
		variables[prefix + "time-locale"] = { getter: () => date.toLocaleTimeString() };
		variables[prefix + "day-locale"] = { getter: () => String(date.getDate()).padStart(2, "0") };
		variables[prefix + "month-locale"] = { getter: () => String(date.getMonth() + 1).padStart(2, "0") };
		variables[prefix + "year-locale"] = { getter: () => String(date.getFullYear()) };
		variables[prefix + "datetime-locale"] = { getter: () => date.toLocaleString() };
		variables[prefix + "datetime-utc"] = { getter: () => date.toUTCString() };
		variables[prefix + "day-utc"] = { getter: () => String(date.getUTCDate()).padStart(2, "0") };
		variables[prefix + "month-utc"] = { getter: () => String(date.getUTCMonth() + 1).padStart(2, "0") };
		variables[prefix + "year-utc"] = { getter: () => String(date.getUTCFullYear()) };
		variables[prefix + "hours-locale"] = { getter: () => String(date.getHours()).padStart(2, "0") };
		variables[prefix + "minutes-locale"] = { getter: () => String(date.getMinutes()).padStart(2, "0") };
		variables[prefix + "seconds-locale"] = { getter: () => String(date.getSeconds()).padStart(2, "0") };
		variables[prefix + "hours-utc"] = { getter: () => String(date.getUTCHours()).padStart(2, "0") };
		variables[prefix + "minutes-utc"] = { getter: () => String(date.getUTCMinutes()).padStart(2, "0") };
		variables[prefix + "seconds-utc"] = { getter: () => String(date.getUTCSeconds()).padStart(2, "0") };
		variables[prefix + "time-ms"] = { getter: () => String(date.getTime()) };
	}
}

function replaceAll(string, search, replacement) {
	if (typeof string.replaceAll == "function") {
		return string.replaceAll(search, replacement);
	} else {
		const searchRegExp = new RegExp(search.replace(REGEXP_ESCAPE, "\\$1"), "g");
		return string.replace(searchRegExp, replacement);
	}
}

async function getValue(valueGetter, dontReplaceSlash, replacementCharacter, lengthData) {
	const { maxLength, maxCharLength } = extractMaxLength(lengthData);
	let value = (await valueGetter()) || "";
	if (!dontReplaceSlash) {
		value = value.replace(/\/+/g, replacementCharacter);
	}
	if (maxLength) {
		value = await truncateText(value, maxLength);
	} else if (maxCharLength) {
		value = value.substring(0, maxCharLength);
	}
	return value;
}

function extractMaxLength(lengthData) {
	if (lengthData) {
		const { unit, length } = lengthData;
		let maxLength, maxCharLength;
		if (unit == "char") {
			maxCharLength = length;
		} else {
			maxLength = length;
		}
		return { maxLength, maxCharLength };
	} else {
		return {};
	}
}

function decode(value) {
	try {
		return decodeURI(value);
		// eslint-disable-next-line no-unused-vars
	} catch (error) {
		return value;
	}
}

function getLastSegment(url, replacementCharacter) {
	let lastSegmentMatch = url.pathname.match(/\/([^/]+)$/),
		lastSegment = lastSegmentMatch && lastSegmentMatch[0];
	if (!lastSegment) {
		lastSegmentMatch = url.href.match(/([^/]+)\/?$/);
		lastSegment = lastSegmentMatch && lastSegmentMatch[0];
	}
	if (!lastSegment) {
		lastSegmentMatch = lastSegment.match(/(.*)\.[^.]+$/);
		lastSegment = lastSegmentMatch && lastSegmentMatch[0];
	}
	if (!lastSegment) {
		lastSegment = url.hostname.replace(/\/+/g, replacementCharacter).replace(/\/$/, "");
	}
	lastSegmentMatch = lastSegment.match(/(.*)\.[^.]+$/);
	if (lastSegmentMatch && lastSegmentMatch[1]) {
		lastSegment = lastSegmentMatch[1];
	}
	lastSegment = lastSegment.replace(/\/$/, "").replace(/^\//, "");
	return lastSegment;
}

function truncateText(content, maxSize) {
	const blob = new Blob([content]);
	const reader = new FileReader();
	reader.readAsText(blob.slice(0, maxSize));
	return new Promise((resolve, reject) => {
		reader.addEventListener(
			"load",
			() => {
				if (content.startsWith(reader.result)) {
					resolve(reader.result);
				} else {
					truncateText(content, maxSize - 1)
						.then(resolve)
						.catch(reject);
				}
			},
			false
		);
		reader.addEventListener("error", reject, false);
	});
}

function getFilenameExtension(options) {
	if (options.compressContent) {
		if (options.selfExtractingArchive) {
			if (options.extractDataFromPage) {
				return "u.zip.html";
			} else {
				return "zip.html";
			}
		} else {
			return "zip";
		}
	} else {
		return "html";
	}
}

function getFilteredOptions(options) {
	const filteredOptions = Object.assign({}, options);
	delete filteredOptions.content;
	delete filteredOptions.usedFonts;
	delete filteredOptions.extensionScriptFiles;
	delete filteredOptions.taskId;
	delete filteredOptions.updatedResources;
	delete filteredOptions.visitDate;
	delete filteredOptions.keepFilename;
	delete filteredOptions.insertCanonicalLink;
	delete filteredOptions.frames;
	delete filteredOptions.win;
	delete filteredOptions.doc;
	delete filteredOptions.url;
	delete filteredOptions.resourceReferrer;
	delete filteredOptions.baseURI;
	delete filteredOptions.rootDocument;
	delete filteredOptions.fontTests;
	delete filteredOptions.canvases;
	delete filteredOptions.fonts;
	delete filteredOptions.worklets;
	delete filteredOptions.stylesheets;
	delete filteredOptions.images;
	delete filteredOptions.posters;
	delete filteredOptions.videos;
	delete filteredOptions.shadowRoots;
	delete filteredOptions.referrer;
	delete filteredOptions.adoptedStyleSheets;
	delete filteredOptions.tabId;
	delete filteredOptions.tabIndex;
	delete filteredOptions.saveDate;
	delete filteredOptions.saveUrl;
	delete filteredOptions.title;
	delete filteredOptions.info;
	return filteredOptions;
}

function optionsToText(options) {
	const csv = [];
	for (const key in options) {
		const value = options[key];
		if (typeof value != "function" && value !== undefined && value !== null && value !== "") {
			csv.push(key + ": " + JSON.stringify(value));
		}
	}
	return csv.join("\n");
}