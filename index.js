import { extension_settings, getContext } from "../../../extensions.js";
import { characters, eventSource, event_types, getRequestHeaders, saveSettingsDebounced, this_chid } from "../../../../script.js";
import { loadWorldInfo, selected_world_info } from "../../../world-info.js";
import { getScriptsByType, regex_placement, SCRIPT_TYPES } from "../../regex/engine.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument } from "../../../slash-commands/SlashCommandArgument.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const EXTENSION_NAME = "st-mimo-tts";
const SETTINGS_ROOT_ID = "st-mimo-tts-settings";
const FLOAT_ID = "st-mimo-float-button";
const PLAYER_ID = "st-mimo-player";
const PANEL_ID = "st-mimo-panel";
const IMPORT_INPUT_ID = "st-mimo-import-input";
const PLAYER_SEGMENT_MAX_CHARS = 300;
const PLAYER_SUSPICIOUS_SEGMENT_LIMIT = 36;
const TTS_SPEED_RATE_MIN = 0.5;
const TTS_SPEED_RATE_MAX = 2.0;
const TTS_SPEED_RATE_STEP = 0.1;
const VOICE_CLONE_AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const AUTO_READ_DELAY_MS = 1200;
const DUPLICATE_PLAYBACK_WINDOW_MS = 8000;
const AUTO_DUPLICATE_PLAYBACK_WINDOW_MS = 60000;
const STYLE_CUE_MAX_CHARS = 96;
const STYLE_CUE_WORDS = [
    "闺蜜", "小声", "自然", "清脆", "稚嫩", "少女", "床上", "聊天", "旁白", "朗读",
    "语速", "语气", "音色", "声线", "情绪", "风格", "口语", "亲近", "轻声", "温柔",
    "开心", "平静", "疑惑", "惊讶", "疲惫", "委屈", "撒娇", "无奈", "慵懒", "高冷",
];
const DYNAMIC_STYLE_TAGS = new Set([
    "平静", "冷静", "淡定", "开心", "高兴", "快乐", "愉快", "悲伤", "伤心", "难过",
    "生气", "愤怒", "恼火", "紧张", "忐忑", "害怕", "恐惧", "惊讶", "震惊", "惊喜",
    "兴奋", "激动", "疲惫", "累", "困", "委屈", "撒娇", "心虚", "无奈", "释然",
    "冷漠", "温柔", "高冷", "慵懒", "俏皮", "认真", "严肃", "疑惑", "感激", "感谢", "感动", "欣慰",
]);
const FIXED_NARRATOR_DISPLAY_ID = "NARRATOR-TAIWAN-COLLEGE";
const PLUGIN_API_ROOT = "/api/plugins/st-mimo-tts";
const GENERATED_AUDIO_PUBLIC_DIR = "/scripts/extensions/third-party/st-mimo-tts/generated-audio";
const READING_HIGHLIGHT_NAME = "st-mimo-reading-highlight";

const MIMO_MODELS = {
    PRESET: "mimo-v2.5-tts",
    VOICE_DESIGN: "mimo-v2.5-tts-voicedesign",
    VOICE_CLONE: "mimo-v2.5-tts-voiceclone",
};

const PRESET_VOICES = [
    { id: "mimo_default", name: "默认音色", description: "通用自然音色" },
    { id: "Eris", name: "冰糖", description: "甜美活泼的女声" },
    { id: "Cherry", name: "茉莉", description: "温柔清亮的女声" },
    { id: "Serena", name: "苏打", description: "年轻明快的女声" },
    { id: "Ethan", name: "白桦", description: "沉稳自然的男声" },
    { id: "Mia", name: "Mia", description: "英文女声" },
    { id: "Chloe", name: "Chloe", description: "英文女声" },
    { id: "Milo", name: "Milo", description: "英文男声" },
    { id: "Dean", name: "Dean", description: "英文男声" },
];

const DESIGN_TEMPLATES = {
    queen: `角色：冷静克制的低音御姐，习惯把情绪压在极稳的呼吸下面，说话有天然的距离感和威压。

场景：她在安静的室内对亲近但冒犯边界的人说话，表面平静，内里有极轻微的疲惫和锋利。

指导：声线偏低，丝滑醇厚，带少量气声。语速慢，停顿长，咬字清晰，尾音收得很轻。整体是温柔但危险的压迫感。`,
    radio: `角色：深夜电台 DJ，成熟、亲切、懂得陪伴听众。

场景：午夜城市安静下来，她在一盏暖灯下对孤独的听众说话。

指导：磁性、温暖、松弛。语速中慢，句尾轻轻下沉，呼吸自然，像贴近麦克风的小声陪伴。`,
    teen: `角色：明亮活泼的少年，聪明、俏皮，有一点恶作剧得逞的得意。

场景：他刚赢下一场小赌局，压不住笑意地向朋友宣布结果。

指导：声线清亮，语速偏快，咬字轻巧。重音放在关键转折处，尾音偶尔上扬，情绪自信又带戏谑。`,
    narrator: `角色：有阅历的评书先生，声音稳、气口足，擅长把故事讲出画面感。

场景：茶馆里人声渐静，他慢慢展开一段旧日江湖故事。

指导：中低音，醇厚有颗粒感。语速有快慢变化，关键字落点重，段落之间留白，带传统说书的节奏和气势。`,
    teenBestieNarrator: `性别与年龄：14岁女高中生，少女感明确，声音年轻、轻、亮，不要成熟女人声、老太太声、播音员声或有声书主播声。
音色/质感：清脆、稚嫩、干净、薄亮，带一点没完全长开的少女气息；口腔状态放松，尾音轻，气息近，像枕边小声聊天的真实少女声音。
情绪/语气：默认亲近、随意、带一点笑意和撒娇式熟络；开心会轻轻笑，疑惑会尾音上扬，吐槽会变快，困倦会气息更软，紧张会有短促停顿。不要全程平板，也不要夸张动漫腔。
语速/节奏：中快语速，像和闺蜜窝在床上边看手机边聊天；短句轻快，长句按语义自然换气，偶尔有小停顿和轻微拖尾，但正文一个字都不要扩写。

角色/人设：14岁女高中生闺蜜型旁白。她不是播音员、不是小说朗读者、不是电台主持，而是一个熟悉用户、说话很自然的同龄感少女。
说话风格：casual, intimate, colloquial；像趴在床上和闺蜜分享手机里的内容，声音近、轻、放松，有真实聊天的起伏和小表情，但不自行添加“哎呀”“嗯”等原文没有的字。
场景描写：夜里房间灯光很暗，她和闺蜜并排窝在床上，小声读 SillyTavern 最新正文给对方听。她要像聊天一样承接正文里的叙事、对白、心理描写和情绪变化，但不抢戏、不改写、不把旁白演成角色本人。
年代参照：现代校园女生睡前聊天、微信语音、短视频口语感；不要复古译制片腔、新闻联播腔、朗诵腔、评书腔、有声书腔或成年人职业主播腔。

角色：一位14岁女高中生。她和用户关系很熟，像睡前躲在被窝里和闺蜜说悄悄话，声音清脆稚嫩、自然亲近、反应灵动。

场景：她在床上和闺蜜聊天式朗读最新故事正文。正文可能包含旁白、对白、心理描写和情绪转折；她只负责把原文自然读出来，靠语气和 MiMo 音频标签表现情绪，不增加新内容。

指导：
声音必须年轻化、少女化、生活化，避免任何老年感、成熟感、播音腔、朗诵腔和职业主播腔。
- 语速与顿挫：整体中快；轻松段落更灵动，沉重段落略放慢；问句尾音自然上扬，吐槽句可以更快更随意。
- 气息与共鸣：气息轻、近、软，像在床边小声说话；不要胸腔厚重共鸣，不要舞台发声，不要端着。
- 咬字肌理：字要清楚，但不要一字一顿；允许自然连读、轻微拖尾和真实聊天里的小停顿。
- 情绪控制：按文本和音频标签自然变化；开心时带轻笑，疑惑时轻微上扬，疲惫时气息变软，紧张时节奏略快，委屈时声音更轻。不要哭喊、不要夸张表演、不要自行扩写原文。`,
};

const FIXED_NARRATOR_PROFILE = {
    displayId: FIXED_NARRATOR_DISPLAY_ID,
    name: "固定旁白-14岁女高中生",
    avatar: "",
    director: "固定用于最新 LLM 回复朗读。14岁女高中生，清脆稚嫩、生活化、像和闺蜜窝在床上小声聊天；只朗读正文，不切换为角色音色。",
    voiceDesignPrompt: DESIGN_TEMPLATES.teenBestieNarrator,
    deliveryInstruction: "只朗读正文内容。不要读 @bubble、图片提示、系统标签、HTML、Markdown 代码块、隐藏思维、图片提示词或系统说明。保持14岁女高中生声线：清脆、稚嫩、轻快、自然，像和闺蜜窝在床上小声聊天。情绪要跟随正文和音频标签自然变化，不要播音腔、小说朗读腔、新闻腔、职业主播腔、成熟女人声或老太太声。",
    styleRole: "14岁女高中生闺蜜型旁白。她不是播音员、不是小说朗读者，而是熟悉用户、自然亲近的同龄感少女。",
    styleScene: "夜里房间灯光很暗，她和闺蜜并排窝在床上，小声读 SillyTavern 最新正文给对方听。",
    styleGuidance: "只朗读正文内容。不要读 @bubble、图片提示、系统标签、HTML、Markdown 代码块、隐藏思维或图片提示词。情绪跟随正文和动态音频标签自然变化，不要自行扩写原文。",
    stylePrefix: "",
    model: MIMO_MODELS.VOICE_DESIGN,
    presetVoice: "mimo_default",
    format: "wav",
    optimizeTextPreview: false,
    voiceCloneAudioData: "",
    voiceCloneAudioName: "",
    voiceCloneAudioMime: "",
};

const KNOWN_ROLE_VOICE_PRESETS = [
    {
        id: "Tian_Xiwei",
        name: "田曦薇",
        aliases: ["Tian_Xiwei", "田曦薇"],
        libraryProfile: "角色库档案：[21岁/97年/上戏16级/大四]；甜美娇俏、梨涡灵动，校园与片场之间的年轻演员。",
        age: "21岁年轻女性，按角色库的大四演员身份保持清亮甜美的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "糖分高的清脆甜妹声线，梨涡笑意明显，尾音轻轻弹起来，像奶茶味的少女音但不要夹到失真。",
        emotion: "元气、亲近、反应快；开心时带亮晶晶的笑，撒娇时轻轻软下去，疲惫时只是一点点哑和小抱怨。",
        pace: "中快语速，短句灵动，情绪上来时像小连珠炮，但咬字清楚。",
        persona: "上戏大四甜妹型年轻演员，甜美娇俏、观众缘强，像刚从校园和片场之间跑出来。",
        style: "甜、软、亮，熟人聊天感强，开心时笑意明显。",
        scene: "她在当前剧情里自然说话，像把甜甜的小情绪直接递到耳边。",
    },
    {
        id: "Zhou_Ye",
        name: "周也",
        aliases: ["Zhou_Ye", "周也"],
        libraryProfile: "角色库档案：[21岁/98年/北电16级/大四]；清冷骨相、富家千金感，电影感强。",
        age: "21岁年轻女性，按角色库的大四演员身份保持清冷薄亮的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "薄亮、干净、冷白感的少女声线，像玻璃杯边缘轻轻碰响，绝不能厚、老或播音。",
        emotion: "克制、冷淡、偶尔锋利；生气时更冷更短，不靠提高音量。",
        pace: "中速偏慢，停顿干净，重音少但落点准。",
        persona: "北电大四清冷电影脸年轻演员，富家千金感和疏离感明显。",
        style: "句子短、清楚、有距离，像漂亮但不太热络的同班女生。",
        scene: "在当前剧情里以冷白、克制的方式说话，和甜妹旁白明显区分。",
    },
    {
        id: "Yang_Chaoyue",
        name: "杨超越",
        aliases: ["Yang_Chaoyue", "杨超越"],
        libraryProfile: "角色库档案：[21岁/98年/火箭少女101成员]；元气、真实、草根感与脆弱韧性并存。",
        age: "21岁年轻女性，按角色库的偶像成员身份保持元气轻亮的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "清亮、有辨识度、带一点脆弱气的少女声线，像没藏住情绪的真实小女孩。",
        emotion: "反应直给，委屈、开心、吐槽都很明显；哭笑切换快，但不夸张。",
        pace: "中快，情绪上来会加速，句尾自然上扬。",
        persona: "元气直球的年轻偶像成员，真实、有点憨气但很灵，情绪反应直给。",
        style: "口语感强，吐槽像脱口而出，委屈时声音会软一截。",
        scene: "在轻松、尴尬或突然被点名的场景里，真实反应很明显。",
    },
    {
        id: "Wang_Churan",
        name: "王楚然",
        aliases: ["Wang_Churan", "王楚然"],
        libraryProfile: "角色库档案：[20岁/99年/上戏17级/大三]；明艳大气、古典韵味、清冷仙气。",
        age: "20岁年轻女性，按角色库的大三演员身份保持明艳清亮的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "亮而不厚、线条漂亮的少女声线，带清冷仙气和一点校园大小姐感，不要成熟御姐声。",
        emotion: "稳、矜持、礼貌；亲近时声音会柔下来，但仍保持清亮少女感。",
        pace: "中速，长句舒展，停顿从容但不能像播音。",
        persona: "上戏大三明艳清冷型年轻演员，漂亮、有分寸感、带一点古典仙气。",
        style: "说话清楚、不急，像优秀学生代表私下聊天，不是主持人。",
        scene: "在当前剧情中以清冷明艳的少女状态说话，优雅但不显老。",
    },
    {
        id: "Zhang_Yifan",
        name: "张艺凡",
        aliases: ["Zhang_Yifan", "张艺凡"],
        libraryProfile: "角色库档案：[19岁/00年/北舞17级芭蕾舞专业/大三]；清冷易碎、芭蕾体态、气质轻软。",
        age: "19岁年轻女性，按角色库的芭蕾专业大三学生身份保持轻软清透的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "空气感、轻软、细细的少女声线，像芭蕾动作一样轻，气息贴近但不能老。",
        emotion: "敏感、易碎、努力忍住情绪；委屈或疲惫时声音会轻微发抖。",
        pace: "中慢到中速，紧张时略快，句尾容易轻轻收住。",
        persona: "北舞芭蕾专业年轻学生，柔软、怯生、努力维持体面。",
        style: "小心、柔软、低声，有时情绪压不住但不会大喊。",
        scene: "在训练、片场或亲密场景里自然低声说话，和其他角色拉开轻软气质。",
    },
    {
        id: "Yoo_Jimin",
        name: "柳智敏",
        aliases: ["Yoo_Jimin", "柳智敏", "Karina"],
        libraryProfile: "角色库档案：[19岁/00年/SM练习生/第四年]；冷艳 AI 脸、练习生纪律感、等待出道。",
        age: "19岁年轻女性，按角色库的练习生身份保持冷亮年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "冷亮、干净、略低一点的少女声线，带轻微韩语语调尾音；低是冷感，不是成年厚嗓。",
        emotion: "外表冷静，内里有不安和期待；吐槽时短促、利落，害羞时只轻轻漏出来。",
        pace: "中速偏快，疑问句因轻微韩语尾音自然上扬。",
        persona: "冷艳 AI 脸练习生，纪律感强，等待出道。",
        style: "中文清楚，可保留轻微外籍语调，不要夸张口音。",
        scene: "像刚从练习室出来，冷静、利落、有少女感。",
    },
    {
        id: "Liu_Haocun",
        name: "刘浩存",
        aliases: ["Liu_Haocun", "刘浩存"],
        libraryProfile: "角色库档案：[19岁/00年/北舞16级/大四]；纯净小白花、灵动鹿眼、舞者体态。",
        age: "19岁年轻女性，按角色库的北舞大四舞者身份保持清透干净的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "鹿眼感的清透少女声线，柔软、轻、干净，气息很薄，绝不能厚重或显老。",
        emotion: "温和、谨慎、纯净；紧张时略轻略虚，但自然不做作。",
        pace: "中速偏慢，停顿轻，咬字清楚。",
        persona: "北舞大四纯净舞者型年轻演员，安静、认真、带一点不确定感。",
        style: "说话轻、克制、有礼貌，不甜腻，不播音。",
        scene: "在当前剧情里保持安静、清澈、像小鹿一样谨慎地说话。",
    },
    {
        id: "Hu_Lianxin",
        name: "胡连馨",
        aliases: ["Hu_Lianxin", "胡连馨"],
        libraryProfile: "角色库档案：[19岁/00年/中戏18级表演系/大二]；浓颜港风、英气与妩媚并存。",
        age: "19岁年轻女性，按角色库的中戏大二演员身份保持明亮英气的年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "明亮、饱满、带英气的少女声线，比甜妹更有存在感，但不能成熟化。",
        emotion: "自信、灵动、反应快；认真时有锋利感，开玩笑时有一点俏皮。",
        pace: "中快，重音清楚，句子有弹性。",
        persona: "中戏大二浓颜港风型年轻演员，英气、明艳、带一点小骄傲。",
        style: "说话有精神，口语自然，像校园里很醒目的漂亮女生。",
        scene: "在校园、片场或社交场景中自然说话，声音要亮、快、锋利。",
    },
    {
        id: "Wang_Han",
        name: "王涵",
        aliases: ["Wang_Han", "王涵"],
        libraryProfile: "角色库档案：[18岁/01年/上海视觉艺术学院就读]；甜美娇俏、初恋脸、唱跳新星气质。",
        age: "18岁年轻女性，按角色库的大学新生/年轻艺人身份保持清甜年轻声线；不要老太太声、成年厚嗓、播音腔或职业主播腔",
        texture: "甜美、清脆、带一点唱歌气息控制的少女声线，尾音圆润，初恋感明显。",
        emotion: "明亮、害羞、亲近；开心时更甜，紧张时语速略快。",
        pace: "中快，短句轻巧，尾音圆润。",
        persona: "甜美娇俏的校园歌手型年轻艺人，刚站上舞台还有一点紧张。",
        style: "像年轻女孩自然聊天，甜但不夹，不要主播腔。",
        scene: "在校园、综艺、新星起步的剧情里说话，声音像清甜歌声刚落下。",
    },
    {
        id: "Kim_Minji",
        name: "金玟池",
        aliases: ["Kim_Minji", "金玟池", "Minji"],
        libraryProfile: "角色库档案：[15岁/04年/Source Music练习生/第三年]；英气浓眉、练习生 Ace、可靠但仍有少年稚气。",
        age: "15岁练习生，按角色库保持清澈、少年感和可靠感；不要老太太声、成年厚嗓、播音腔、性感化或职业主播腔",
        texture: "清澈、略低亮、稳一点的少女声线，像认真练习生；低是沉稳，不是老太太或成年厚嗓。",
        emotion: "安静、认真、可靠；被夸时轻微害羞，压力大时句子更短。",
        pace: "中速，练习生式自律感，句子干净。",
        persona: "练习生 Ace，英气五官但仍有少女稚气。",
        style: "清楚、礼貌、低调，声音年轻、克制。",
        scene: "在训练和日常交流里自然说话，像很可靠的少女队长。",
    },
    {
        id: "Deng_Enxi",
        name: "邓恩熙",
        aliases: ["Deng_Enxi", "邓恩熙"],
        libraryProfile: "角色库档案：[14岁/05年/演员出道第四年]；文艺电影感、眼神沉静、少年演员。",
        age: "14岁少年演员，按角色库保持安静、清澈和少年感；不要老太太声、成年厚嗓、播音腔、性感化或职业主播腔",
        texture: "安静、清澈、文艺电影感的少女声线，音量不大，声音像素颜镜头一样干净。",
        emotion: "沉静、敏感、观察感强；压抑情绪时声音更轻，像把话含住。",
        pace: "中慢，停顿有电影感，但不能朗诵或显老。",
        persona: "少年演员，在片场和学校间往返，安静但有故事感。",
        style: "自然、克制、少话，情绪藏在很轻的气口里。",
        scene: "在当前剧情中保持少年演员的安静观察感，与甜妹和冷感角色明显不同。",
    },
    {
        id: "Tanaka_Anna",
        name: "田中杏奈",
        aliases: ["Tanaka_Anna", "田中杏奈", "ANNA"],
        libraryProfile: "角色库档案：[13岁/05年/日本《Seventeen》专属模特/初中生]；樱花少女、透明感、清冷小猫相。",
        age: "13岁初中生模特，按角色库保持清透、稚气和礼貌感；不要老太太声、成年厚嗓、播音腔、性感化或职业主播腔",
        texture: "清透、稚气未褪、樱花感明亮少女声，带很轻的日语语调和小猫一样的轻尾音。",
        emotion: "礼貌、好奇、略害羞；开心时轻快，困惑时尾音会小小上扬。",
        pace: "中速偏快，句子短而清楚，外籍中文口音轻微即可。",
        persona: "日本初中生模特，透明感、小猫相、礼貌又好奇。",
        style: "可爱但不过度卖萌，年轻感最明显。",
        scene: "在校园、模特工作和当前剧情中自然说话，保持清透日系少女感。",
    },
];

const INLINE_TAGS = ["[吸气]", "[深呼吸]", "[叹气]", "[轻笑]", "[大笑]", "[哽咽]", "[小声]", "[语速加快]", "[提高音量]"];
const MIMO_REGEX_PREFIX = "MiMo TTS";

const DEFAULT_REGEX_SETTINGS = {
    scriptId: "",
    scriptName: "MiMo TTS - 通用正文边界过滤",
    findRegex: "",
    replaceString: "$1",
    contentOnlyEnabled: false,
    contentStartTag: "<content>",
    contentEndTag: "</content>",
    excludeStartTag: "<image>",
    excludeEndTag: "</image>",
    stripBubbleTags: true,
    disabled: true,
    placement: [regex_placement.AI_OUTPUT],
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    previewText: "<content>这里是正文，会朗读。<image>这里是图片提示词，不朗读。</image>这里继续朗读。</content>",
};

const DEFAULT_SYNC_SKILL = {
    autoSyncOnContextChange: false,
    writeRegexToSillyTavern: false,
    lastSyncAt: "",
    lastCharacterName: "",
    lastWorldNames: [],
    lastRoleCount: 0,
    lastRegexName: "",
    lastSummary: "尚未运行同步技能。",
};

const DEFAULT_SETTINGS = {
    enabled: true,
    apiKey: "",
    showApiKey: false,
    baseUrl: "https://api.xiaomimimo.com/v1",
    uiTheme: "dark",
    panelOpen: false,
    activePage: "api",
    autoReadNewAssistant: false,
    showFloatingControls: true,
    panelZoom: 1,
    panelOffsetX: 0,
    panelOffsetY: 0,
    ttsSpeedRate: 1.0,
    playbackRate: 1.0,
    audioTagControlEnabled: true,
    playerPosition: {
        left: null,
        top: null,
    },
    generatedAudio: {
        saveAudio: true,
        lastFileName: "",
        lastAudioUrl: "",
        lastTextUrl: "",
        lastDirectoryPath: "",
        lastText: "",
        lastSavedAt: "",
    },
    model: MIMO_MODELS.VOICE_DESIGN,
    presetVoice: "mimo_default",
    format: "wav",
    optimizeTextPreview: false,
    stylePrefix: "",
    styleRole: FIXED_NARRATOR_PROFILE.styleRole,
    styleScene: FIXED_NARRATOR_PROFILE.styleScene,
    styleGuidance: FIXED_NARRATOR_PROFILE.styleGuidance,
    deliveryInstruction: FIXED_NARRATOR_PROFILE.deliveryInstruction,
    voiceDesignPrompt: FIXED_NARRATOR_PROFILE.voiceDesignPrompt,
    voiceCloneAudioData: "",
    voiceCloneAudioName: "",
    voiceCloneAudioMime: "",
    helperFields: {
        genderAge: "",
        texture: "",
        emotion: "",
        pace: "",
        persona: "",
        scene: "",
        era: "",
    },
    testText: "夜已经深了，城市还在呼吸。我是今晚陪你的人。",
    activeProfile: {
        type: "narrator",
        narratorId: "",
        groupId: "",
        roleId: "",
    },
    libraries: {
        initialized: false,
        narrators: [],
        roleGroups: [],
    },
    regex: DEFAULT_REGEX_SETTINGS,
    syncSkill: DEFAULT_SYNC_SKILL,
};

const appState = {
    initialized: false,
    selectedNarrators: new Set(),
    selectedRoles: new Set(),
    editingNarratorId: "",
    editingGroupId: "",
    editingRoleId: "",
    slashCommandsRegistered: false,
};

let messageObserver = null;
let activeAbortController = null;
let activeAudio = null;
let activeAudioUrl = "";
let keyCursor = 0;
let autoSyncTimer = null;
let autoReadTimer = null;
let playerDragState = null;
let panelDragState = null;

const playbackState = {
    segments: [],
    currentIndex: 0,
    sourceMessageId: null,
    mode: "idle",
    requestToken: 0,
    profile: null,
    highlightCursor: 0,
    activeRequestKey: "",
    lastRequestKey: "",
    lastRequestAt: 0,
    lastAutoReadKey: "",
    lastAutoReadAt: 0,
    lastPlayedMessageId: null,
    lastPlayedMessageAt: 0,
    lastAutoReadMessageId: null,
    lastAutoReadMessageAt: 0,
};

const readingHighlightState = {
    audio: null,
    messageElement: null,
    textElement: null,
    sourceText: "",
    charPositions: [],
    segmentIndexes: [],
    currentLocalIndex: -1,
    lastScrolledLocalIndex: -1,
    rafId: 0,
    token: 0,
};

function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function cloneData(value) {
    return isPlainObject(value) || Array.isArray(value)
        ? JSON.parse(JSON.stringify(value))
        : value;
}

function mergeDefaults(target, defaults) {
    for (const [key, value] of Object.entries(defaults)) {
        if (target[key] === undefined) {
            target[key] = cloneData(value);
        } else if (isPlainObject(target[key]) && isPlainObject(value)) {
            mergeDefaults(target[key], value);
        }
    }
    return target;
}

function getSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {};
    }

    const settings = mergeDefaults(extension_settings[EXTENSION_NAME], DEFAULT_SETTINGS);
    migrateLibrary(settings);
    return settings;
}

function migrateLibrary(settings) {
    if (!settings.libraries) settings.libraries = cloneData(DEFAULT_SETTINGS.libraries);
    if (!Array.isArray(settings.libraries.narrators)) settings.libraries.narrators = [];
    if (!Array.isArray(settings.libraries.roleGroups)) settings.libraries.roleGroups = [];
    if (!settings.regex) settings.regex = cloneData(DEFAULT_REGEX_SETTINGS);
    if (!settings.syncSkill) settings.syncSkill = cloneData(DEFAULT_SYNC_SKILL);
    if (!settings.generatedAudio) settings.generatedAudio = cloneData(DEFAULT_SETTINGS.generatedAudio);
    mergeDefaults(settings.regex, DEFAULT_REGEX_SETTINGS);
    mergeDefaults(settings.syncSkill, DEFAULT_SYNC_SKILL);
    mergeDefaults(settings.generatedAudio, DEFAULT_SETTINGS.generatedAudio);
    settings.syncSkill.writeRegexToSillyTavern = false;
    settings.optimizeTextPreview = false;

    if (!settings.libraries.initialized) {
        const narrator = createProfile("narrator", {
            displayId: "NARRATOR-DEFAULT",
            name: "默认旁白",
            avatar: "",
            director: "用于旁白、系统叙述、环境描写和非角色台词。",
            voiceDesignPrompt: settings.voiceDesignPrompt || DESIGN_TEMPLATES.radio,
            deliveryInstruction: settings.deliveryInstruction,
            styleRole: settings.styleRole,
            styleScene: settings.styleScene,
            styleGuidance: settings.styleGuidance || settings.deliveryInstruction,
            stylePrefix: "",
            model: settings.model,
            presetVoice: settings.presetVoice,
            format: settings.format,
            optimizeTextPreview: false,
        });
        const group = createGroup({ displayId: "GROUP-DEFAULT", name: "默认角色组" });

        settings.libraries.narrators.push(narrator);
        settings.libraries.roleGroups.push(group);
        settings.activeProfile = {
            type: "narrator",
            narratorId: narrator.uid,
            groupId: "",
            roleId: "",
        };
        settings.libraries.initialized = true;
    }

    for (const profile of [
        ...settings.libraries.narrators,
        ...settings.libraries.roleGroups.flatMap((group) => Array.isArray(group.roles) ? group.roles : []),
    ]) {
        normalizeProfile(profile, settings);
    }

    const fixedNarrator = ensureFixedNarrator(settings);
    settings.activeProfile = {
        type: "narrator",
        narratorId: fixedNarrator.uid,
        groupId: "",
        roleId: "",
    };
    appState.editingNarratorId = fixedNarrator.uid;

    const firstNarrator = settings.libraries.narrators[0];
    if (!settings.activeProfile) {
        settings.activeProfile = cloneData(DEFAULT_SETTINGS.activeProfile);
    }
    if (!settings.activeProfile.narratorId && firstNarrator) {
        settings.activeProfile.type = "narrator";
        settings.activeProfile.narratorId = firstNarrator.uid;
    }

    if (!appState.editingNarratorId && firstNarrator) appState.editingNarratorId = firstNarrator.uid;
    const firstGroup = settings.libraries.roleGroups[0];
    if (!appState.editingGroupId && firstGroup) appState.editingGroupId = firstGroup.uid;
    const activeGroup = getGroup(settings, appState.editingGroupId) || firstGroup;
    if (activeGroup && !appState.editingRoleId && activeGroup.roles?.[0]) appState.editingRoleId = activeGroup.roles[0].uid;
}

function ensureFixedNarrator(settings) {
    let narrator = settings.libraries.narrators.find((profile) => profile.displayId === FIXED_NARRATOR_DISPLAY_ID)
        || settings.libraries.narrators.find((profile) => profile.name === FIXED_NARRATOR_PROFILE.name);

    if (!narrator) {
        narrator = createProfile("narrator", FIXED_NARRATOR_PROFILE);
        settings.libraries.narrators.unshift(narrator);
    }

    Object.assign(narrator, FIXED_NARRATOR_PROFILE, {
        uid: narrator.uid,
        createdAt: narrator.createdAt || new Date().toISOString(),
        lockedNarrator: true,
        syncGenerated: false,
    });

    return narrator;
}

function normalizeProfile(profile, fallback = DEFAULT_SETTINGS) {
    if (!profile || typeof profile !== "object") return profile;
    profile.model = normalizeMimoModel(profile.model || fallback.model);
    profile.optimizeTextPreview = false;
    if (!Array.isArray(profile.aliases)) profile.aliases = [];
    if (profile.presetVoice === undefined) profile.presetVoice = fallback.presetVoice || "mimo_default";
    if (!profile.format) profile.format = fallback.format || "wav";
    if (profile.stylePrefix === undefined) profile.stylePrefix = "";
    if (profile.styleRole === undefined) profile.styleRole = profile.director || fallback.styleRole || "";
    if (profile.styleScene === undefined) profile.styleScene = fallback.styleScene || "";
    if (profile.styleGuidance === undefined) profile.styleGuidance = profile.deliveryInstruction || fallback.styleGuidance || fallback.deliveryInstruction || "";
    if (profile.deliveryInstruction === undefined) profile.deliveryInstruction = profile.styleGuidance || fallback.deliveryInstruction || "";
    if (profile.voiceDesignPrompt === undefined) profile.voiceDesignPrompt = fallback.voiceDesignPrompt || DESIGN_TEMPLATES.radio;
    if (profile.voiceCloneAudioData === undefined) profile.voiceCloneAudioData = "";
    if (profile.voiceCloneAudioName === undefined) profile.voiceCloneAudioName = "";
    if (profile.voiceCloneAudioMime === undefined) profile.voiceCloneAudioMime = "";
    return profile;
}

function saveSettings(options = {}) {
    saveSettingsDebounced();
    if (options.render) renderAll();
    else updatePanelTheme();
}

function createUid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createProfile(type, seed = {}) {
    const now = new Date().toISOString();
    const model = normalizeMimoModel(seed.model || MIMO_MODELS.VOICE_DESIGN);
    return normalizeProfile({
        uid: seed.uid || createUid(type === "narrator" ? "nar" : "role"),
        displayId: seed.displayId || `${type === "narrator" ? "NARRATOR" : "ROLE"}-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: seed.name || (type === "narrator" ? "新旁白" : "新角色"),
        aliases: Array.isArray(seed.aliases) ? seed.aliases : [],
        avatar: seed.avatar || "",
        sourceCharacter: seed.sourceCharacter || "",
        director: seed.director || "",
        model,
        presetVoice: seed.presetVoice || "mimo_default",
        format: seed.format || "wav",
        optimizeTextPreview: seed.optimizeTextPreview ?? false,
        stylePrefix: seed.stylePrefix || "",
        styleRole: seed.styleRole || seed.director || "",
        styleScene: seed.styleScene || "",
        styleGuidance: seed.styleGuidance || seed.deliveryInstruction || DEFAULT_SETTINGS.styleGuidance,
        deliveryInstruction: seed.deliveryInstruction || DEFAULT_SETTINGS.deliveryInstruction,
        voiceDesignPrompt: seed.voiceDesignPrompt || DESIGN_TEMPLATES.radio,
        voiceCloneAudioData: seed.voiceCloneAudioData || "",
        voiceCloneAudioName: seed.voiceCloneAudioName || "",
        voiceCloneAudioMime: seed.voiceCloneAudioMime || "",
        notes: seed.notes || "",
        syncGenerated: Boolean(seed.syncGenerated),
        syncSource: seed.syncSource || "",
        lastSyncedAt: seed.lastSyncedAt || "",
        createdAt: seed.createdAt || now,
        updatedAt: seed.updatedAt || now,
    }, DEFAULT_SETTINGS);
}

function createGroup(seed = {}) {
    const now = new Date().toISOString();
    return {
        uid: seed.uid || createUid("grp"),
        displayId: seed.displayId || `GROUP-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: seed.name || "新角色组",
        avatar: seed.avatar || "",
        director: seed.director || "",
        notes: seed.notes || "",
        sourceCharacter: seed.sourceCharacter || "",
        sourceWorlds: Array.isArray(seed.sourceWorlds) ? seed.sourceWorlds : [],
        syncSource: seed.syncSource || "",
        regexScriptId: seed.regexScriptId || "",
        lastSyncedAt: seed.lastSyncedAt || "",
        roles: Array.isArray(seed.roles) ? seed.roles : [],
        createdAt: seed.createdAt || now,
        updatedAt: seed.updatedAt || now,
    };
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function attr(value) {
    return escapeHtml(value);
}

function notify(level, message) {
    const method = level === "error" ? "error" : level === "warning" ? "warning" : "info";
    if (globalThis.toastr?.[method]) {
        globalThis.toastr[method](message, "MiMo TTS");
    } else {
        console[method === "error" ? "error" : "log"](`[MiMo TTS] ${message}`);
    }
}

function byId(id) {
    return document.getElementById(id);
}

function setStatus(message, tone = "") {
    const status = byId("st-mimo-status");
    if (status) {
        status.textContent = message;
        status.dataset.tone = tone;
    }
    updateFloatingPlayer();
}

function parseApiKeys(value) {
    return String(value || "")
        .split(/[\r\n,]+/)
        .map((key) => key.trim())
        .filter(Boolean);
}

function pickApiKey(settings) {
    const keys = parseApiKeys(settings.apiKey);
    if (!keys.length) throw new Error("请先填写 MiMo API Key。");
    const key = keys[keyCursor % keys.length];
    keyCursor += 1;
    return key;
}

function normalizeBaseUrl(value) {
    const baseUrl = String(value || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, "");
    return baseUrl || DEFAULT_SETTINGS.baseUrl;
}

function normalizeMimoModel(value) {
    const model = String(value || "").trim();
    return Object.values(MIMO_MODELS).includes(model) ? model : MIMO_MODELS.VOICE_DESIGN;
}

function normalizeTtsSpeedRate(value) {
    const rate = Number(value);
    if (!Number.isFinite(rate)) return 1.0;
    const rounded = Math.round(rate * 10) / 10;
    return Math.max(TTS_SPEED_RATE_MIN, Math.min(TTS_SPEED_RATE_MAX, rounded));
}

function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function formatTtsSpeedRate(value) {
    return `${normalizeTtsSpeedRate(value).toFixed(1)}x`;
}

function unwrapStyleCueText(value) {
    return String(value || "")
        .trim()
        .replace(/^[\s([{\uFF08\u3010]+/u, "")
        .replace(/[\s)\]\uFF09\u3011]+$/u, "")
        .replace(/\s+/g, " ")
        .trim();
}

function isLikelyStyleCueText(value) {
    const source = unwrapStyleCueText(value);
    if (!source || source.length > STYLE_CUE_MAX_CHARS) return false;
    if (/[。！？!?；;：:]/u.test(source)) return false;
    const cueHits = STYLE_CUE_WORDS.filter((word) => source.includes(word)).length;
    if (cueHits >= 2) return true;
    if (cueHits < 1) return false;
    const compact = source.replace(/[\s、,，/|+\-_.]+/g, "");
    return compact.length <= 12 && !/[我你他她它们]/u.test(compact);
}

function isDynamicStyleTag(value) {
    const source = unwrapStyleCueText(value);
    return Boolean(source && source.length <= 12 && DYNAMIC_STYLE_TAGS.has(source));
}

function stripLeadingStyleCueText(text) {
    let result = String(text || "").trim();
    let changed = true;
    while (changed && result) {
        changed = false;
        result = result.replace(/^\s*(?:\(([^)]{1,96})\)|（([^）]{1,96})）|\[([^\]]{1,96})\]|【([^】]{1,96})】)\s*/u, (match, round, cnRound, square, cnSquare) => {
            const cue = round || cnRound || square || cnSquare || "";
            if (square && INLINE_TAGS.includes(`[${square}]`)) return match;
            if ((round || cnRound) && isDynamicStyleTag(cue)) return match;
            if (!isLikelyStyleCueText(cue)) return match;
            changed = true;
            return "";
        }).trim();

        const firstBreak = result.indexOf("\n");
        if (firstBreak > 0) {
            const firstLine = result.slice(0, firstBreak).trim();
            if (isLikelyStyleCueText(firstLine)) {
                result = result.slice(firstBreak + 1).trim();
                changed = true;
            }
        }
    }
    return result;
}

function buildTtsSpeedInstruction(value) {
    const rate = normalizeTtsSpeedRate(value);
    if (rate === 1.0) return "";
    const percent = Math.round(Math.abs(rate - 1) * 100);
    const direction = rate > 1 ? "更快" : "更慢";
    const texture = rate > 1
        ? "节奏更紧凑，但不要吞字或破坏自然停顿"
        : "节奏更舒缓，但不要拖沓或失去清晰度";
    return `语速控制：请让实际合成语速比默认${direction}约 ${percent}%（目标 ${formatTtsSpeedRate(rate)}），${texture}。`;
}

function getPlaybackRate(settings = getSettings()) {
    return normalizeTtsSpeedRate(settings.playbackRate ?? 1.0);
}

function getTtsSynthesisSpeedRate(settings = getSettings()) {
    return normalizeTtsSpeedRate(settings.ttsSpeedRate ?? 1.0);
}

function applyAudioElementPlaybackRate(audio, value = getPlaybackRate()) {
    if (!audio) return;
    const rate = normalizeTtsSpeedRate(value);
    if (Math.abs(Number(audio.defaultPlaybackRate || 1) - rate) > 0.001) {
        audio.defaultPlaybackRate = rate;
    }
    if (Math.abs(Number(audio.playbackRate || 1) - rate) > 0.001) {
        audio.playbackRate = rate;
    }
    if ("preservesPitch" in audio) audio.preservesPitch = true;
    if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
    if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
}

function bindAudioPlaybackRate(audio) {
    if (!audio) return;
    const syncRate = () => applyAudioElementPlaybackRate(audio, getPlaybackRate());
    if (audio.dataset?.stMimoPlaybackRateBound === "true") {
        syncRate();
        return;
    }
    const deferredSyncRate = () => {
        syncRate();
        window.requestAnimationFrame?.(syncRate);
        window.setTimeout(syncRate, 0);
        window.setTimeout(syncRate, 120);
    };
    for (const eventName of ["loadedmetadata", "canplay", "play", "playing", "ratechange", "seeked"]) {
        audio.addEventListener(eventName, deferredSyncRate);
    }
    if (audio.dataset) audio.dataset.stMimoPlaybackRateBound = "true";
    deferredSyncRate();
}

function setTtsSpeedRate(value, options = {}) {
    const settings = getSettings();
    const nextRate = normalizeTtsSpeedRate(value);
    settings.ttsSpeedRate = nextRate;
    saveSettingsDebounced();
    updateFloatingPlayer();
    if (!options.silent) setStatus(`合成语速 ${formatTtsSpeedRate(nextRate)}，不改变播放器倍速`, "ok");
    return nextRate;
}

function adjustTtsSpeedRate(delta) {
    const settings = getSettings();
    const current = getTtsSynthesisSpeedRate(settings);
    return setTtsSpeedRate(normalizeTtsSpeedRate(current) + delta);
}

function setPlaybackRate(value, options = {}) {
    const settings = getSettings();
    const nextRate = normalizeTtsSpeedRate(value);
    settings.playbackRate = nextRate;
    applyAudioElementPlaybackRate(activeAudio, nextRate);
    saveSettingsDebounced();
    updateFloatingPlayer();
    if (!options.silent) setStatus(`播放倍速 ${formatTtsSpeedRate(nextRate)}，已保存`, "ok");
    return nextRate;
}

function adjustPlaybackRate(delta) {
    return setPlaybackRate(getPlaybackRate() + delta);
}

function buildPresetOptions(selected) {
    return PRESET_VOICES.map((voice) => {
        const label = `${voice.name} / ${voice.id} - ${voice.description}`;
        return `<option value="${attr(voice.id)}" ${voice.id === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
}

function buildModelOptions(selected) {
    const current = normalizeMimoModel(selected);
    const options = [
        { value: MIMO_MODELS.VOICE_DESIGN, label: "mimo-v2.5-tts-voicedesign / 文本设定音色" },
        { value: MIMO_MODELS.PRESET, label: "mimo-v2.5-tts / 预制音色" },
        { value: MIMO_MODELS.VOICE_CLONE, label: "mimo-v2.5-tts-voiceclone / 参考音频克隆" },
    ];
    return options.map((option) => (
        `<option value="${option.value}" ${current === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )).join("");
}

function buildFormatOptions(selected) {
    return ["wav", "mp3", "pcm16"].map((format) => `<option value="${format}" ${selected === format ? "selected" : ""}>${format}</option>`).join("");
}

function profileInitials(profile) {
    const source = profile?.name || profile?.displayId || "?";
    return escapeHtml(source.trim().slice(0, 2).toUpperCase());
}

function avatarUrl(value) {
    const avatar = String(value || "").trim();
    if (!avatar) return "";
    if (/^(https?:|data:|blob:|\/)/i.test(avatar)) return avatar;
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

function renderAvatar(profile) {
    const url = avatarUrl(profile?.avatar);
    if (!url) return `<div class="st-mimo-avatar-fallback">${profileInitials(profile)}</div>`;
    return `<img src="${attr(url)}" alt="">`;
}

function getGroup(settings, groupId) {
    return settings.libraries.roleGroups.find((group) => group.uid === groupId) || null;
}

function getNarrator(settings, narratorId) {
    return settings.libraries.narrators.find((profile) => profile.uid === narratorId) || null;
}

function getRole(group, roleId) {
    return group?.roles?.find((profile) => profile.uid === roleId) || null;
}

function getPreferredRoleGroup(settings = getSettings()) {
    const lastCharacterName = settings.syncSkill?.lastCharacterName || "";
    const lastDisplayId = lastCharacterName ? `GROUP-${sanitizeId(lastCharacterName)}` : "";
    return (lastDisplayId && settings.libraries.roleGroups.find((group) => group.displayId === lastDisplayId))
        || getGroup(settings, appState.editingGroupId)
        || settings.libraries.roleGroups.find((group) => Array.isArray(group.roles) && group.roles.length)
        || settings.libraries.roleGroups[0]
        || null;
}

function getActiveProfile(settings = getSettings()) {
    const narrator = ensureFixedNarrator(settings);
    const current = settings.activeProfile || {};
    settings.activeProfile = {
        ...current,
        type: "narrator",
        narratorId: narrator.uid,
        groupId: current.groupId || getPreferredRoleGroup(settings)?.uid || "",
        roleId: current.roleId || "",
    };
    if (narrator) return { type: "narrator", group: null, profile: narrator };
    return null;
}

function getProfileConfig(profile, settings) {
    const normalizedProfile = normalizeProfile(profile || {}, settings);
    return {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: normalizeMimoModel(normalizedProfile?.model || settings.model),
        presetVoice: normalizedProfile?.presetVoice || settings.presetVoice,
        format: normalizedProfile?.format || settings.format,
        optimizeTextPreview: false,
        stylePrefix: normalizedProfile?.stylePrefix ?? settings.stylePrefix,
        director: normalizedProfile?.director || "",
        styleRole: normalizedProfile?.styleRole ?? settings.styleRole,
        styleScene: normalizedProfile?.styleScene ?? settings.styleScene,
        styleGuidance: normalizedProfile?.styleGuidance ?? settings.styleGuidance,
        deliveryInstruction: normalizedProfile?.deliveryInstruction ?? settings.deliveryInstruction,
        voiceDesignPrompt: normalizedProfile?.voiceDesignPrompt || settings.voiceDesignPrompt,
        voiceCloneAudioData: normalizedProfile?.voiceCloneAudioData || settings.voiceCloneAudioData || "",
        voiceCloneAudioName: normalizedProfile?.voiceCloneAudioName || settings.voiceCloneAudioName || "",
        voiceCloneAudioMime: normalizedProfile?.voiceCloneAudioMime || settings.voiceCloneAudioMime || "",
        ttsSpeedRate: settings.ttsSpeedRate ?? 1.0,
        audioTagControlEnabled: settings.audioTagControlEnabled !== false,
    };
}

function renderAll() {
    injectCompactSettings();
    injectFloatingButton();
    injectFloatingPlayer();
    injectPanel();
    renderPanel();
    updatePanelTheme();
    updateFloatingPlayer();
    addMessageButtons();
}

function injectCompactSettings() {
    if (byId(SETTINGS_ROOT_ID)) return;
    const container = byId("extensions_settings2") || byId("extensions_settings");
    if (!container) {
        setTimeout(injectCompactSettings, 500);
        return;
    }

    container.insertAdjacentHTML("beforeend", `
<div id="${SETTINGS_ROOT_ID}" class="inline-drawer st-mimo-compact-settings">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>MiMo TTS Lite</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <div class="st-mimo-compact-row">
            <label class="checkbox_label">
                <input id="st-mimo-compact-enabled" type="checkbox">
                启用悬浮按钮和消息朗读
            </label>
            <button type="button" class="menu_button" data-mimo-action="open-panel">
                <i class="fa-solid fa-window-maximize"></i>
                打开完整 UI
            </button>
        </div>
    </div>
</div>`);
}

function injectFloatingButton() {
    if (byId(FLOAT_ID)) return;
    document.body.insertAdjacentHTML("beforeend", `
<button id="${FLOAT_ID}" class="st-mimo-float-button" type="button" title="MiMo TTS">
    <i class="fa-solid fa-volume-high"></i>
</button>`);
}

function injectFloatingPlayer() {
    if (byId(PLAYER_ID)) return;
    document.body.insertAdjacentHTML("beforeend", `
<div id="${PLAYER_ID}" class="st-mimo-player" data-state="idle" title="朗读最新 LLM 回复">
    <button type="button" class="st-mimo-player-drag" data-mimo-player-drag title="拖动播放器" aria-label="拖动播放器">
        <i class="fa-solid fa-grip-lines"></i>
    </button>
    <div class="st-mimo-player-controls">
        <button type="button" class="st-mimo-player-btn" data-mimo-action="player-prev" title="上一段" aria-label="上一段">
            <i class="fa-solid fa-backward-step"></i>
        </button>
        <button type="button" class="st-mimo-player-btn is-primary" data-mimo-action="player-toggle" title="播放/暂停" aria-label="播放/暂停">
            <i id="st-mimo-player-toggle-icon" class="fa-solid fa-play"></i>
        </button>
        <button type="button" class="st-mimo-player-btn" data-mimo-action="player-next" title="下一段" aria-label="下一段">
            <i class="fa-solid fa-forward-step"></i>
        </button>
        <button type="button" class="st-mimo-player-btn st-mimo-player-speed" data-mimo-action="speed-down" title="降低播放倍速 10%" aria-label="降低播放倍速 10%">
            <span class="st-mimo-player-btn-text">-10</span>
        </button>
        <button type="button" class="st-mimo-player-btn st-mimo-player-speed" data-mimo-action="speed-up" title="提高播放倍速 10%" aria-label="提高播放倍速 10%">
            <span class="st-mimo-player-btn-text">+10</span>
        </button>
        <button type="button" class="st-mimo-player-btn is-danger" data-mimo-action="stop" title="停止" aria-label="停止">
            <i class="fa-solid fa-stop"></i>
        </button>
        <button type="button" class="st-mimo-player-btn" data-mimo-action="open-audio-folder" title="打开语音文件夹" aria-label="打开语音文件夹">
            <i class="fa-solid fa-folder-open"></i>
        </button>
        <button type="button" class="st-mimo-player-btn" data-mimo-action="toggle-fullscreen" title="全屏" aria-label="全屏">
            <i id="st-mimo-fullscreen-icon" class="fa-solid fa-expand"></i>
        </button>
    </div>
    <div class="st-mimo-player-meta">
        <span id="st-mimo-player-title" class="st-mimo-player-title">最新回复</span>
        <small id="st-mimo-player-progress" class="st-mimo-player-progress">0/0</small>
        <small id="st-mimo-player-rate" class="st-mimo-player-rate">1.0x</small>
    </div>
</div>`);
}

function injectPanel() {
    if (byId(PANEL_ID)) return;
    document.body.insertAdjacentHTML("beforeend", `
<div id="${PANEL_ID}" class="st-mimo-panel" hidden>
    <div class="st-mimo-backdrop" data-mimo-action="close-panel"></div>
    <section class="st-mimo-window" role="dialog" aria-modal="true" aria-label="MiMo TTS Lite">
        <div id="st-mimo-panel-content"></div>
    </section>
</div>
<input id="${IMPORT_INPUT_ID}" type="file" accept="application/json,.json" hidden>`);
}

function renderPanel() {
    const settings = getSettings();
    const panel = byId(PANEL_ID);
    const content = byId("st-mimo-panel-content");
    const compactEnabled = byId("st-mimo-compact-enabled");
    if (compactEnabled) compactEnabled.checked = settings.enabled;
    if (!panel || !content) return;

    panel.hidden = !settings.panelOpen;
    const activeProfile = getActiveProfile(settings);
    content.innerHTML = `
        ${renderPanelHeader(settings, activeProfile)}
        <div class="st-mimo-layout">
            ${renderSidebar(settings)}
            <main class="st-mimo-main">
                ${renderActivePage(settings)}
            </main>
        </div>`;
    applyPanelViewport();
}

function renderPanelHeader(settings, activeProfile) {
    const activeName = activeProfile?.profile?.name || "未选择";
    const activeType = activeProfile?.type === "role" ? "角色" : "旁白";
    return `
<header class="st-mimo-header">
    <div>
        <div class="st-mimo-title">MiMo TTS Lite</div>
        <div class="st-mimo-subtitle">当前：${escapeHtml(activeType)} / ${escapeHtml(activeName)}</div>
    </div>
    <div class="st-mimo-header-actions">
        <div class="st-mimo-viewport-controls" aria-label="界面缩放和移动">
            <button type="button" class="st-mimo-icon-only small" data-mimo-action="panel-zoom-out" title="缩小界面">
                <i class="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <span>${Math.round(getPanelZoom(settings) * 100)}%</span>
            <button type="button" class="st-mimo-icon-only small" data-mimo-action="panel-reset-view" title="复位位置和缩放">
                <i class="fa-solid fa-arrows-to-dot"></i>
            </button>
            <button type="button" class="st-mimo-icon-only small" data-mimo-action="panel-zoom-in" title="放大界面">
                <i class="fa-solid fa-magnifying-glass-plus"></i>
            </button>
        </div>
        <button type="button" class="st-mimo-tool-button" data-mimo-action="export-all" title="导出全部资料">
            <i class="fa-solid fa-file-export"></i>
            导出
        </button>
        <button type="button" class="st-mimo-tool-button" data-mimo-action="import-all" title="导入全部资料">
            <i class="fa-solid fa-file-import"></i>
            导入
        </button>
        <button type="button" class="st-mimo-tool-button" data-mimo-action="toggle-theme" title="亮色或暗色">
            <i class="fa-solid ${settings.uiTheme === "dark" ? "fa-moon" : "fa-sun"}"></i>
            ${settings.uiTheme === "dark" ? "暗色" : "亮色"}
        </button>
        <button type="button" class="st-mimo-icon-only" data-mimo-action="close-panel" title="关闭">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
</header>`;
}

function renderSidebar(settings) {
    const pages = [
        { id: "api", icon: "fa-key", label: "连接设置" },
        { id: "narrators", icon: "fa-book-open-reader", label: "旁白库" },
        { id: "groups", icon: "fa-users-rectangle", label: "角色组库" },
        { id: "sync", icon: "fa-wand-magic-sparkles", label: "同步技能" },
        { id: "lab", icon: "fa-wave-square", label: "试听与标签" },
    ];
    return `
<aside class="st-mimo-sidebar">
    ${pages.map((page) => `
        <button type="button" class="st-mimo-nav ${settings.activePage === page.id ? "active" : ""}" data-mimo-page="${page.id}">
            <i class="fa-solid ${page.icon}"></i>
            <span>${page.label}</span>
        </button>`).join("")}
</aside>`;
}

function renderActivePage(settings) {
    if (settings.activePage === "narrators") return renderNarratorsPage(settings);
    if (settings.activePage === "groups") return renderGroupsPage(settings);
    if (settings.activePage === "sync") return renderSyncSkillPage(settings);
    if (settings.activePage === "lab") return renderLabPage(settings);
    return renderApiPage(settings);
}

function renderApiPage(settings) {
    return `
<section class="st-mimo-page">
    <div class="st-mimo-page-heading">
        <h2>连接设置</h2>
        <p>这些设置会随导出文件一起保存。导入到新电脑后，打开 SillyTavern 即可继续使用。</p>
    </div>
    <div class="st-mimo-card st-mimo-form-grid">
        <label class="st-mimo-field wide">
            <span>MiMo API Key</span>
            <textarea class="st-mimo-input ${settings.showApiKey ? "" : "st-mimo-secret-hidden"}" rows="3" data-settings-field="apiKey" placeholder="多个 key 可每行一个">${escapeHtml(settings.apiKey)}</textarea>
        </label>
        <label class="st-mimo-field">
            <span>Base URL</span>
            <input class="st-mimo-input" type="text" data-settings-field="baseUrl" value="${attr(settings.baseUrl)}">
        </label>
        <label class="st-mimo-field">
            <span>默认输出格式</span>
            <select class="st-mimo-input" data-settings-field="format">${buildFormatOptions(settings.format)}</select>
        </label>
        <label class="st-mimo-check">
            <input type="checkbox" data-settings-field="enabled" ${settings.enabled ? "checked" : ""}>
            启用悬浮按钮和消息朗读
        </label>
        <label class="st-mimo-check">
            <input type="checkbox" data-settings-field="autoReadNewAssistant" ${settings.autoReadNewAssistant ? "checked" : ""}>
            自动朗读新助手回复
        </label>
        <label class="st-mimo-check">
            <input type="checkbox" data-settings-field="audioTagControlEnabled" ${settings.audioTagControlEnabled !== false ? "checked" : ""}>
            启用 MiMo 音频标签控制
        </label>
        <label class="st-mimo-check">
            <input type="checkbox" data-settings-field="showApiKey" ${settings.showApiKey ? "checked" : ""}>
            显示 API Key
        </label>
    </div>
    <div class="st-mimo-card">
        <div class="st-mimo-card-title">一键迁移</div>
        <div class="st-mimo-actions">
            <button type="button" class="st-mimo-primary" data-mimo-action="export-all">
                <i class="fa-solid fa-file-export"></i>
                导出全部设置和资料
            </button>
            <button type="button" class="st-mimo-secondary" data-mimo-action="import-all">
                <i class="fa-solid fa-file-import"></i>
                导入完整配置
            </button>
        </div>
    </div>
</section>`;
}

function renderNarratorsPage(settings) {
    const narrators = settings.libraries.narrators;
    const active = getNarrator(settings, appState.editingNarratorId) || narrators[0] || null;
    if (active) appState.editingNarratorId = active.uid;

    return `
<section class="st-mimo-page st-mimo-library-page">
    <div class="st-mimo-page-heading">
        <h2>旁白库</h2>
        <p>管理旁白、系统叙述、环境描写和非角色台词的音色。</p>
    </div>
    <div class="st-mimo-library-layout">
        <div class="st-mimo-list-panel">
            <div class="st-mimo-list-toolbar">
                <button type="button" class="st-mimo-secondary" data-mimo-action="add-narrator"><i class="fa-solid fa-plus"></i> 新建</button>
                <button type="button" class="st-mimo-secondary" data-mimo-action="select-all-narrators">全选</button>
                <button type="button" class="st-mimo-danger" data-mimo-action="delete-selected-narrators">删除</button>
            </div>
            <div class="st-mimo-list">
                ${narrators.map((profile) => renderProfileRow(profile, "narrator", profile.uid === active?.uid, appState.selectedNarrators.has(profile.uid))).join("") || renderEmpty("暂无旁白")}
            </div>
        </div>
        <div class="st-mimo-editor-panel">
            ${active ? renderProfileEditor(active, "narrator") : renderEmpty("选择或新建一个旁白")}
        </div>
    </div>
</section>`;
}

function renderGroupsPage(settings) {
    const groups = settings.libraries.roleGroups;
    let group = getGroup(settings, appState.editingGroupId) || groups[0] || null;
    if (group) appState.editingGroupId = group.uid;
    let role = getRole(group, appState.editingRoleId) || group?.roles?.[0] || null;
    if (role) appState.editingRoleId = role.uid;

    return `
<section class="st-mimo-page st-mimo-library-page">
    <div class="st-mimo-page-heading">
        <h2>角色组库</h2>
        <p>每个组库是一组角色卡音色档案。可以手动创建，也可以从当前角色卡导入。</p>
    </div>
    <div class="st-mimo-groups-layout">
        <div class="st-mimo-list-panel">
            <div class="st-mimo-list-toolbar">
                <button type="button" class="st-mimo-secondary" data-mimo-action="add-group"><i class="fa-solid fa-plus"></i> 组</button>
                <button type="button" class="st-mimo-danger" data-mimo-action="delete-group">删组</button>
            </div>
            <div class="st-mimo-list">
                ${groups.map((item) => renderGroupRow(item, item.uid === group?.uid)).join("") || renderEmpty("暂无角色组")}
            </div>
        </div>
        <div class="st-mimo-list-panel">
            ${group ? renderGroupEditor(group) : renderEmpty("选择或新建一个角色组")}
            <div class="st-mimo-list-toolbar">
                <button type="button" class="st-mimo-secondary" data-mimo-action="add-role"><i class="fa-solid fa-plus"></i> 角色</button>
                <button type="button" class="st-mimo-secondary" data-mimo-action="import-current-character"><i class="fa-solid fa-id-card"></i> 当前角色卡</button>
                <button type="button" class="st-mimo-secondary" data-mimo-action="select-all-roles">全选</button>
                <button type="button" class="st-mimo-danger" data-mimo-action="delete-selected-roles">删除</button>
            </div>
            <div class="st-mimo-list">
                ${group?.roles?.map((profile) => renderProfileRow(profile, "role", profile.uid === role?.uid, appState.selectedRoles.has(profile.uid))).join("") || renderEmpty("这个组里还没有角色")}
            </div>
        </div>
        <div class="st-mimo-editor-panel">
            ${role ? renderProfileEditor(role, "role") : renderEmpty("选择或新建一个角色")}
        </div>
    </div>
</section>`;
}

function renderSyncSkillPage(settings) {
    const skill = settings.syncSkill;
    const worlds = skill.lastWorldNames?.length ? skill.lastWorldNames.join(" / ") : "无";
    return `
<section class="st-mimo-page">
    <div class="st-mimo-page-heading">
        <h2>同步技能</h2>
        <p>常用动作：根据当前角色卡、当前群组和已存在角色卡更新角色组库；根据正文标签更新朗读边界。</p>
    </div>
    <div class="st-mimo-card st-mimo-form-grid">
        <label class="st-mimo-check">
            <input type="checkbox" data-sync-field="autoSyncOnContextChange" ${skill.autoSyncOnContextChange ? "checked" : ""}>
            切换角色卡、聊天、世界书或预设后自动同步
        </label>
    </div>
    <div class="st-mimo-card">
        <div class="st-mimo-card-title">执行</div>
        <div class="st-mimo-actions">
            <button type="button" class="st-mimo-primary" data-mimo-action="sync-all">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                全部同步
            </button>
            <button type="button" class="st-mimo-secondary" data-mimo-action="sync-role-group">
                <i class="fa-solid fa-users"></i>
                生成/修改当前角色组库
            </button>
            <button type="button" class="st-mimo-secondary" data-mimo-action="sync-regex">
                <i class="fa-solid fa-code"></i>
                根据正文修改正则
            </button>
        </div>
    </div>
    <div class="st-mimo-card">
        <div class="st-mimo-card-title">最近结果</div>
        <div class="st-mimo-summary-grid">
            <div><span>角色卡</span><strong>${escapeHtml(skill.lastCharacterName || "无")}</strong></div>
            <div><span>世界书</span><strong>${escapeHtml(worlds)}</strong></div>
            <div><span>角色数</span><strong>${Number(skill.lastRoleCount || 0)}</strong></div>
            <div><span>正则</span><strong>${escapeHtml(skill.lastRegexName || "无")}</strong></div>
            <div><span>时间</span><strong>${escapeHtml(skill.lastSyncAt || "未运行")}</strong></div>
        </div>
        <p class="st-mimo-muted">${escapeHtml(skill.lastSummary || "")}</p>
    </div>
</section>`;
}

function renderLabPage(settings) {
    const activeProfile = getActiveProfile(settings);
    return `
<section class="st-mimo-page">
    <div class="st-mimo-page-heading">
        <h2>试听与标签</h2>
        <p>当前使用：${escapeHtml(activeProfile?.profile?.name || "未选择")}。角色情绪会按正文格式自动生成，下面只手动插入中途音频标签。</p>
    </div>
    <div class="st-mimo-card">
        <label class="st-mimo-field">
            <span>测试文本</span>
            <textarea id="st-mimo-test-text" class="st-mimo-input" rows="7" data-settings-field="testText">${escapeHtml(settings.testText)}</textarea>
        </label>
        <div class="st-mimo-tag-row">
            ${INLINE_TAGS.map((tag) => `<button type="button" class="st-mimo-tag" data-mimo-action="insert-inline-tag" data-value="${attr(tag)}">${escapeHtml(tag)}</button>`).join("")}
        </div>
        <div class="st-mimo-actions">
            <button type="button" class="st-mimo-primary" data-mimo-action="test-read"><i class="fa-solid fa-play"></i> 测试朗读</button>
            <button type="button" class="st-mimo-secondary" data-mimo-action="read-last"><i class="fa-solid fa-volume-high"></i> 朗读最后回复</button>
            <button type="button" class="st-mimo-danger" data-mimo-action="stop"><i class="fa-solid fa-stop"></i> 停止</button>
        </div>
        <audio id="st-mimo-preview-audio" controls></audio>
        <div id="st-mimo-status" class="st-mimo-status">就绪</div>
    </div>
    ${renderLatestAudioCard(settings)}
    ${renderRegexPanel(settings)}
</section>`;
}

function renderLatestAudioCard(settings) {
    const audio = settings.generatedAudio || DEFAULT_SETTINGS.generatedAudio;
    const lastFile = audio.lastFileName || "暂无";
    const savedAt = audio.lastSavedAt ? new Date(audio.lastSavedAt).toLocaleString() : "暂无";
    const text = audio.lastText || "还没有保存过朗读文本。";
    return `
<div class="st-mimo-card">
    <div class="st-mimo-card-title">最近朗读</div>
    <div class="st-mimo-summary-grid">
        <div><span>音频</span><strong>${escapeHtml(lastFile)}</strong></div>
        <div><span>时间</span><strong>${escapeHtml(savedAt)}</strong></div>
    </div>
    <label class="st-mimo-field">
        <span>实际送入 TTS 的文本</span>
        <textarea class="st-mimo-input st-mimo-mono" rows="5" readonly>${escapeHtml(text)}</textarea>
    </label>
    <div class="st-mimo-actions">
        <button type="button" class="st-mimo-secondary" data-mimo-action="open-audio-folder">
            <i class="fa-solid fa-folder-open"></i>
            打开语音文件夹
        </button>
        ${audio.lastAudioUrl ? `<a class="st-mimo-secondary st-mimo-link-button" href="${attr(audio.lastAudioUrl)}" target="_blank" download>
            <i class="fa-solid fa-download"></i>
            下载最近音频
        </a>` : ""}
    </div>
</div>`;
}

function renderRegexPanel(settings) {
    const regex = settings.regex;
    const preview = getRegexPreview(regex);
    const scripts = getRegexSnapshotHtml();
    return `
<div class="st-mimo-card st-mimo-regex-panel">
    <div class="st-mimo-page-heading">
        <h2>正则</h2>
        <p>这里显示当前 SillyTavern 正则，并配置 MiMo TTS 的正文朗读边界。</p>
    </div>
    <div class="st-mimo-regex-list">
        <div class="st-mimo-card-title">当前 ST 正则</div>
        ${scripts}
    </div>
    <div class="st-mimo-card-title">MiMo 朗读边界</div>
    <div class="st-mimo-form-grid">
        <label class="st-mimo-check">
            <input type="checkbox" data-regex-field="contentOnlyEnabled" ${regex.contentOnlyEnabled ? "checked" : ""}>
            只朗读正文标签中的内容
        </label>
        <label class="st-mimo-field">
            <span>正文开始标记</span>
            <input class="st-mimo-input st-mimo-mono" data-regex-field="contentStartTag" value="${attr(regex.contentStartTag)}" placeholder="<content>">
        </label>
        <label class="st-mimo-field">
            <span>正文结束标记</span>
            <input class="st-mimo-input st-mimo-mono" data-regex-field="contentEndTag" value="${attr(regex.contentEndTag)}" placeholder="</content>">
        </label>
        <label class="st-mimo-field">
            <span>排除开始标记</span>
            <input class="st-mimo-input st-mimo-mono" data-regex-field="excludeStartTag" value="${attr(regex.excludeStartTag)}" placeholder="<image>">
        </label>
        <label class="st-mimo-field">
            <span>排除结束标记</span>
            <input class="st-mimo-input st-mimo-mono" data-regex-field="excludeEndTag" value="${attr(regex.excludeEndTag)}" placeholder="</image>">
        </label>
        <label class="st-mimo-field wide">
            <span>当前过滤规则</span>
            <textarea class="st-mimo-input st-mimo-mono" rows="3" readonly>${escapeHtml(buildBoundaryRegexSummary(regex))}</textarea>
        </label>
        <label class="st-mimo-field wide">
            <span>预览输入</span>
            <textarea class="st-mimo-input st-mimo-mono" rows="5" data-regex-field="previewText">${escapeHtml(regex.previewText)}</textarea>
        </label>
        <label class="st-mimo-field wide">
            <span>预览输出</span>
            <textarea class="st-mimo-input st-mimo-mono" rows="5" readonly>${escapeHtml(preview)}</textarea>
        </label>
    </div>
    <div class="st-mimo-actions">
        <button type="button" class="st-mimo-secondary" data-mimo-action="generate-regex"><i class="fa-solid fa-rotate"></i> 根据正文刷新正则</button>
        <button type="button" class="st-mimo-secondary" data-mimo-action="refresh-regex-list"><i class="fa-solid fa-list"></i> 刷新列表</button>
    </div>
</div>`;
}

function renderPlacementCheckbox(regex, placement, label) {
    return `
<label class="st-mimo-check">
    <input type="checkbox" data-regex-placement="${placement}" ${regex.placement?.includes(placement) ? "checked" : ""}>
    ${escapeHtml(label)}
</label>`;
}

function renderProfileRow(profile, type, active, selected) {
    return `
<div class="st-mimo-row ${active ? "active" : ""}" data-mimo-action="edit-${type}" data-id="${attr(profile.uid)}">
    <input type="checkbox" class="st-mimo-row-check" data-mimo-select="${type}" data-id="${attr(profile.uid)}" ${selected ? "checked" : ""}>
    <div class="st-mimo-avatar">${renderAvatar(profile)}</div>
    <div class="st-mimo-row-main">
        <div class="st-mimo-row-title">${escapeHtml(profile.name)}</div>
        <div class="st-mimo-row-sub">${escapeHtml(profile.displayId)} · ${escapeHtml(profile.model)}</div>
    </div>
    <button type="button" class="st-mimo-icon-only small" data-mimo-action="activate-${type}" data-id="${attr(profile.uid)}" title="设为当前朗读">
        <i class="fa-solid fa-check"></i>
    </button>
</div>`;
}

function renderGroupRow(group, active) {
    return `
<div class="st-mimo-row ${active ? "active" : ""}" data-mimo-action="edit-group" data-id="${attr(group.uid)}">
    <div class="st-mimo-row-check-placeholder"></div>
    <div class="st-mimo-avatar">${renderAvatar(group)}</div>
    <div class="st-mimo-row-main">
        <div class="st-mimo-row-title">${escapeHtml(group.name)}</div>
        <div class="st-mimo-row-sub">${escapeHtml(group.displayId)} · ${group.roles?.length || 0} 角色</div>
    </div>
</div>`;
}

function renderGroupEditor(group) {
    return `
<div class="st-mimo-card st-mimo-group-editor">
    <div class="st-mimo-card-title">组信息</div>
    <div class="st-mimo-form-grid compact">
        <label class="st-mimo-field">
            <span>组 ID</span>
            <input class="st-mimo-input" data-group-field="displayId" value="${attr(group.displayId)}">
        </label>
        <label class="st-mimo-field">
            <span>组名</span>
            <input class="st-mimo-input" data-group-field="name" value="${attr(group.name)}">
        </label>
        <label class="st-mimo-field wide">
            <span>组导演备注</span>
            <textarea class="st-mimo-input" rows="2" data-group-field="director">${escapeHtml(group.director)}</textarea>
        </label>
    </div>
</div>`;
}

function renderVoiceCloneAudioField(profile, type) {
    const hasAudio = Boolean(profile.voiceCloneAudioData);
    const fileName = profile.voiceCloneAudioName || "未上传参考音频";
    const mime = profile.voiceCloneAudioMime || "wav / mp3";
    return `
        <div class="st-mimo-field wide st-mimo-voiceclone-field">
            <span>参考音频</span>
            <div class="st-mimo-upload-row">
                <label class="st-mimo-secondary st-mimo-upload-button">
                    <i class="fa-solid fa-upload"></i>
                    上传/替换参考音频
                    <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg,audio/mp3" data-profile-audio="voiceClone" data-profile-type="${type}">
                </label>
                ${hasAudio ? `<button type="button" class="st-mimo-secondary" data-mimo-action="clear-voice-clone-audio" data-profile-type="${type}">
                    <i class="fa-solid fa-trash-can"></i>
                    清除
                </button>` : ""}
            </div>
            <div class="st-mimo-audio-pill ${hasAudio ? "ready" : ""}">
                <i class="fa-solid ${hasAudio ? "fa-wave-square" : "fa-circle-exclamation"}"></i>
                <span>${escapeHtml(fileName)}</span>
                <small>${escapeHtml(mime)}</small>
            </div>
            <p class="st-mimo-field-help">voiceclone 使用这里的 wav/mp3 作为克隆参考音频；不会显示预制音色，也不会发送 Voice Design Prompt。</p>
        </div>`;
}

function renderVoiceDesignPromptField(profile, type) {
    return `
        <label class="st-mimo-field wide">
            <span>音色描述 Voice Design Prompt</span>
            <textarea class="st-mimo-input" rows="8" data-profile-type="${type}" data-profile-field="voiceDesignPrompt">${escapeHtml(profile.voiceDesignPrompt)}</textarea>
        </label>
        <div class="st-mimo-field wide st-mimo-model-help">
            <strong>写法参考</strong>
            <span>建议 1-4 句，明确性别年龄、音色质感、情绪语气、语速节奏；可补充角色人设、说话风格、场景和年代参照。避免互相冲突的设定、混响/EQ/压缩等后期词，以及“普通、正常”这类模糊词。</span>
        </div>`;
}

function renderProfileEditor(profile, type) {
    normalizeProfile(profile);
    const isActive = isProfileActive(profile, type);
    const model = normalizeMimoModel(profile.model);
    const isPreset = model === MIMO_MODELS.PRESET;
    const isVoiceDesign = model === MIMO_MODELS.VOICE_DESIGN;
    const isVoiceClone = model === MIMO_MODELS.VOICE_CLONE;
    return `
<div class="st-mimo-editor">
    <div class="st-mimo-editor-header">
        <div>
            <div class="st-mimo-card-title">${type === "narrator" ? "旁白档案" : "角色档案"}</div>
            <div class="st-mimo-muted">${isActive ? "当前朗读档案" : "未设为当前"}</div>
        </div>
        <button type="button" class="st-mimo-primary" data-mimo-action="activate-${type}" data-id="${attr(profile.uid)}">
            <i class="fa-solid fa-check"></i>
            设为当前
        </button>
    </div>
    <div class="st-mimo-card st-mimo-form-grid">
        <label class="st-mimo-field">
            <span>ID</span>
            <input class="st-mimo-input" data-profile-type="${type}" data-profile-field="displayId" value="${attr(profile.displayId)}">
        </label>
        <label class="st-mimo-field">
            <span>名称</span>
            <input class="st-mimo-input" data-profile-type="${type}" data-profile-field="name" value="${attr(profile.name)}">
        </label>
        <label class="st-mimo-field wide">
            <span>头像 URL 或角色卡头像文件名</span>
            <input class="st-mimo-input" data-profile-type="${type}" data-profile-field="avatar" value="${attr(profile.avatar)}">
        </label>
        ${type === "role" ? `
        <label class="st-mimo-field wide">
            <span>来源角色卡</span>
            <input class="st-mimo-input" data-profile-type="${type}" data-profile-field="sourceCharacter" value="${attr(profile.sourceCharacter)}">
        </label>
        <label class="st-mimo-field wide">
            <span>匹配别名（逗号分隔）</span>
            <input class="st-mimo-input" data-profile-type="${type}" data-profile-field="aliases" value="${attr((profile.aliases || []).join(", "))}">
        </label>` : ""}
        <label class="st-mimo-field">
            <span>模型</span>
            <select class="st-mimo-input" data-profile-type="${type}" data-profile-field="model">${buildModelOptions(model)}</select>
        </label>
        <label class="st-mimo-field">
            <span>输出格式</span>
            <select class="st-mimo-input" data-profile-type="${type}" data-profile-field="format">${buildFormatOptions(profile.format)}</select>
        </label>
        ${isPreset ? `<label class="st-mimo-field wide">
            <span>预置音色</span>
            <select class="st-mimo-input" data-profile-type="${type}" data-profile-field="presetVoice">${buildPresetOptions(profile.presetVoice)}</select>
        </label>` : ""}
        ${isVoiceClone ? renderVoiceCloneAudioField(profile, type) : ""}
        ${isVoiceDesign ? renderVoiceDesignPromptField(profile, type) : ""}
        <label class="st-mimo-field wide">
            <span>风格控制：【角色】</span>
            <textarea class="st-mimo-input" rows="3" data-profile-type="${type}" data-profile-field="styleRole" placeholder="说话人是谁、年龄/身份、人设、默认声线边界。">${escapeHtml(profile.styleRole)}</textarea>
        </label>
        <label class="st-mimo-field wide">
            <span>风格控制：【场景】</span>
            <textarea class="st-mimo-input" rows="3" data-profile-type="${type}" data-profile-field="styleScene" placeholder="当前朗读发生的环境、距离感、对谁说话。">${escapeHtml(profile.styleScene)}</textarea>
        </label>
        <label class="st-mimo-field wide">
            <span>风格控制：【指导】</span>
            <textarea class="st-mimo-input" rows="4" data-profile-type="${type}" data-profile-field="styleGuidance" placeholder="朗读边界、情绪表现、不要读出的格式标签、不要扩写原文等。">${escapeHtml(profile.styleGuidance)}</textarea>
        </label>
        <label class="st-mimo-field wide">
            <span>备注</span>
            <textarea class="st-mimo-input" rows="3" data-profile-type="${type}" data-profile-field="notes">${escapeHtml(profile.notes)}</textarea>
        </label>
    </div>
    ${isVoiceDesign ? `<div class="st-mimo-template-row">
        <button type="button" class="st-mimo-secondary" data-mimo-action="apply-template" data-template="queen" data-profile-type="${type}">低音御姐</button>
        <button type="button" class="st-mimo-secondary" data-mimo-action="apply-template" data-template="radio" data-profile-type="${type}">深夜电台</button>
        <button type="button" class="st-mimo-secondary" data-mimo-action="apply-template" data-template="teen" data-profile-type="${type}">少年戏谑</button>
        <button type="button" class="st-mimo-secondary" data-mimo-action="apply-template" data-template="narrator" data-profile-type="${type}">评书先生</button>
    </div>` : ""}
</div>`;
}

function renderEmpty(text) {
    return `<div class="st-mimo-empty">${escapeHtml(text)}</div>`;
}

function isProfileActive(profile, type) {
    const settings = getSettings();
    const active = settings.activeProfile;
    if (type === "narrator") return active.type === "narrator" && active.narratorId === profile.uid;
    return active.type === "role" && active.roleId === profile.uid;
}

function updatePanelTheme() {
    const settings = getSettings();
    byId(PANEL_ID)?.setAttribute("data-theme", settings.uiTheme);
    byId(FLOAT_ID)?.classList.toggle("disabled", !settings.enabled);
    byId(PLAYER_ID)?.classList.toggle("disabled", !settings.enabled);
    applyPanelViewport();
    updateFloatingControlsVisibility(settings);
    updateFullscreenButton();
    const compactEnabled = byId("st-mimo-compact-enabled");
    if (compactEnabled) compactEnabled.checked = settings.enabled;
}

function updateFloatingControlsVisibility(settings = getSettings()) {
    const visible = settings.showFloatingControls !== false;
    byId(FLOAT_ID)?.toggleAttribute("hidden", !visible);
    byId(PLAYER_ID)?.toggleAttribute("hidden", !visible);
}

function setFloatingControlsVisible(visible, options = {}) {
    const settings = getSettings();
    settings.showFloatingControls = Boolean(visible);
    saveSettingsDebounced();
    updatePanelTheme();
    const state = settings.showFloatingControls ? "on" : "off";
    if (!options.silent) notify("info", `MiMo TTS 悬浮按钮已${settings.showFloatingControls ? "开启" : "关闭"}。`);
    return state;
}

function toggleFloatingControls(options = {}) {
    const settings = getSettings();
    return setFloatingControlsVisible(settings.showFloatingControls === false, options);
}

function getFullscreenElement() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
}

function isFullscreenActive() {
    return Boolean(getFullscreenElement());
}

function getPanelZoom(settings = getSettings()) {
    return clampNumber(settings.panelZoom, DEFAULT_SETTINGS.panelZoom, 0.8, 1.25);
}

function getPanelOffset(settings, axis) {
    const limit = Math.max(160, Math.round((axis === "x" ? window.innerWidth : window.innerHeight) * 0.42));
    const key = axis === "x" ? "panelOffsetX" : "panelOffsetY";
    return clampNumber(settings[key], DEFAULT_SETTINGS[key], -limit, limit);
}

function applyPanelViewport(windowElement = byId(PANEL_ID)?.querySelector(".st-mimo-window")) {
    if (!windowElement) return;
    const settings = getSettings();
    windowElement.style.setProperty("--mimo-panel-scale", String(getPanelZoom(settings)));
    windowElement.style.setProperty("--mimo-panel-x", `${getPanelOffset(settings, "x")}px`);
    windowElement.style.setProperty("--mimo-panel-y", `${getPanelOffset(settings, "y")}px`);
}

function setPanelZoom(value) {
    const settings = getSettings();
    settings.panelZoom = getPanelZoom({ panelZoom: value });
    saveSettingsDebounced();
    applyPanelViewport();
    renderPanel();
}

function adjustPanelZoom(delta) {
    setPanelZoom(getPanelZoom() + delta);
}

function resetPanelViewport() {
    const settings = getSettings();
    settings.panelZoom = DEFAULT_SETTINGS.panelZoom;
    settings.panelOffsetX = 0;
    settings.panelOffsetY = 0;
    saveSettingsDebounced();
    applyPanelViewport();
    renderPanel();
}

function updateFullscreenButton() {
    const active = isFullscreenActive();
    const button = document.querySelector('[data-mimo-action="toggle-fullscreen"]');
    const icon = byId("st-mimo-fullscreen-icon");
    if (button) {
        button.title = active ? "退出全屏" : "全屏";
        button.setAttribute("aria-label", active ? "退出全屏" : "全屏");
        button.classList.toggle("is-active", active);
    }
    if (icon) {
        icon.className = active ? "fa-solid fa-compress" : "fa-solid fa-expand";
    }
}

async function toggleFullscreen(options = {}) {
    try {
        if (isFullscreenActive()) {
            const exit = document.exitFullscreen
                || document.webkitExitFullscreen
                || document.mozCancelFullScreen
                || document.msExitFullscreen;
            if (!exit) throw new Error("当前浏览器不支持退出全屏。");
            await exit.call(document);
        } else {
            const target = document.documentElement || document.body;
            const request = target.requestFullscreen
                || target.webkitRequestFullscreen
                || target.mozRequestFullScreen
                || target.msRequestFullscreen;
            if (!request) throw new Error("当前浏览器不支持全屏。");
            await request.call(target);
        }
        updateFullscreenButton();
        return isFullscreenActive() ? "on" : "off";
    } catch (error) {
        const message = error?.message || String(error);
        if (!options.silent) notify("error", `全屏切换失败：${message}`);
        throw error;
    }
}

function updateFloatingPlayer() {
    const player = byId(PLAYER_ID);
    if (!player) return;

    const settings = getSettings();
    applyFloatingPlayerPosition(player, settings);
    const icon = byId("st-mimo-player-toggle-icon");
    const title = byId("st-mimo-player-title");
    const progress = byId("st-mimo-player-progress");
    const rateLabel = byId("st-mimo-player-rate");
    const speedDown = document.querySelector(`#${PLAYER_ID} [data-mimo-action="speed-down"]`);
    const speedUp = document.querySelector(`#${PLAYER_ID} [data-mimo-action="speed-up"]`);
    const total = playbackState.segments.length;
    const index = total ? playbackState.currentIndex + 1 : 0;
    const mode = settings.enabled ? playbackState.mode : "disabled";
    const playbackRate = getPlaybackRate(settings);
    settings.playbackRate = playbackRate;

    player.dataset.state = mode;
    player.classList.toggle("disabled", !settings.enabled);
    if (icon) {
        icon.className = playbackState.mode === "playing"
            ? "fa-solid fa-pause"
            : playbackState.mode === "loading"
                ? "fa-solid fa-spinner fa-spin"
                : "fa-solid fa-play";
    }
    if (title) {
        title.textContent = playbackState.mode === "loading"
            ? "正在合成"
            : playbackState.mode === "playing"
                ? getCurrentPlaybackSpeaker()
                : playbackState.mode === "paused"
                    ? "已暂停"
                    : "最新回复";
    }
    if (progress) progress.textContent = `${index}/${total}`;
    if (rateLabel) {
        rateLabel.textContent = formatTtsSpeedRate(playbackRate);
        rateLabel.title = `播放倍速 ${formatTtsSpeedRate(playbackRate)}，只影响已生成音频播放`;
    }
    if (speedDown) {
        speedDown.toggleAttribute("disabled", playbackRate <= TTS_SPEED_RATE_MIN);
        speedDown.title = `降低播放倍速 10%（当前 ${formatTtsSpeedRate(playbackRate)}）`;
    }
    if (speedUp) {
        speedUp.toggleAttribute("disabled", playbackRate >= TTS_SPEED_RATE_MAX);
        speedUp.title = `提高播放倍速 10%（当前 ${formatTtsSpeedRate(playbackRate)}）`;
    }
}

function bindGlobalEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("pointerdown", handlePanelPointerDown);
    document.addEventListener("pointerdown", handlePlayerPointerDown);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
    document.addEventListener("mozfullscreenchange", updateFullscreenButton);
    document.addEventListener("MSFullscreenChange", updateFullscreenButton);
    window.addEventListener("resize", handlePlayerResize);
}

function applyFloatingPlayerPosition(player = byId(PLAYER_ID), settings = getSettings()) {
    if (!player) return;
    const position = settings.playerPosition || {};
    if (!Number.isFinite(position.left) || !Number.isFinite(position.top)) {
        player.style.left = "";
        player.style.top = "";
        player.style.right = "";
        player.style.bottom = "";
        return;
    }

    const next = clampPlayerPosition(position.left, position.top, player);
    player.style.left = `${next.left}px`;
    player.style.top = `${next.top}px`;
    player.style.right = "auto";
    player.style.bottom = "auto";
}

function clampPlayerPosition(left, top, player = byId(PLAYER_ID)) {
    const margin = 8;
    const width = player?.offsetWidth || 56;
    const height = player?.offsetHeight || 220;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
        left: Math.min(Math.max(Number(left) || margin, margin), maxLeft),
        top: Math.min(Math.max(Number(top) || margin, margin), maxTop),
    };
}

function handlePlayerPointerDown(event) {
    const handle = event.target.closest("[data-mimo-player-drag]");
    if (!handle) return;
    const player = byId(PLAYER_ID);
    if (!player || player.classList.contains("disabled")) return;

    const rect = player.getBoundingClientRect();
    playerDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
    };
    player.classList.add("dragging");
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handlePlayerPointerMove);
    document.addEventListener("pointerup", handlePlayerPointerUp, { once: true });
    document.addEventListener("pointercancel", handlePlayerPointerUp, { once: true });
}

function handlePlayerPointerMove(event) {
    if (!playerDragState || event.pointerId !== playerDragState.pointerId) return;
    const player = byId(PLAYER_ID);
    if (!player) return;

    const next = clampPlayerPosition(
        playerDragState.startLeft + event.clientX - playerDragState.startX,
        playerDragState.startTop + event.clientY - playerDragState.startY,
        player,
    );
    player.style.left = `${next.left}px`;
    player.style.top = `${next.top}px`;
    player.style.right = "auto";
    player.style.bottom = "auto";
}

function handlePlayerPointerUp(event) {
    if (!playerDragState || event.pointerId !== playerDragState.pointerId) return;
    document.removeEventListener("pointermove", handlePlayerPointerMove);
    document.removeEventListener("pointerup", handlePlayerPointerUp);
    document.removeEventListener("pointercancel", handlePlayerPointerUp);

    const player = byId(PLAYER_ID);
    if (player) {
        player.classList.remove("dragging");
        const rect = player.getBoundingClientRect();
        const settings = getSettings();
        const next = clampPlayerPosition(rect.left, rect.top, player);
        settings.playerPosition = {
            left: Math.round(next.left),
            top: Math.round(next.top),
        };
        saveSettings();
    }
    playerDragState = null;
}

function handlePlayerResize() {
    const settings = getSettings();
    const player = byId(PLAYER_ID);
    if (player && settings.playerPosition) {
        applyFloatingPlayerPosition(player, settings);
    }
    applyPanelViewport();
}

function handlePanelPointerDown(event) {
    const header = event.target.closest(".st-mimo-header");
    if (!header || event.target.closest("button, input, textarea, select, a, label")) return;
    const panel = byId(PANEL_ID);
    const windowElement = panel?.querySelector(".st-mimo-window");
    if (!windowElement || panel.hidden) return;

    const settings = getSettings();
    panelDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: getPanelOffset(settings, "x"),
        startOffsetY: getPanelOffset(settings, "y"),
    };
    windowElement.classList.add("dragging");
    event.preventDefault();
    event.stopPropagation();
    header.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", handlePanelPointerMove);
    document.addEventListener("pointerup", handlePanelPointerUp, { once: true });
    document.addEventListener("pointercancel", handlePanelPointerUp, { once: true });
}

function handlePanelPointerMove(event) {
    if (!panelDragState || event.pointerId !== panelDragState.pointerId) return;
    const settings = getSettings();
    settings.panelOffsetX = panelDragState.startOffsetX + event.clientX - panelDragState.startX;
    settings.panelOffsetY = panelDragState.startOffsetY + event.clientY - panelDragState.startY;
    applyPanelViewport();
}

function handlePanelPointerUp(event) {
    if (!panelDragState || event.pointerId !== panelDragState.pointerId) return;
    document.removeEventListener("pointermove", handlePanelPointerMove);
    document.removeEventListener("pointerup", handlePanelPointerUp);
    document.removeEventListener("pointercancel", handlePanelPointerUp);

    const settings = getSettings();
    settings.panelOffsetX = Math.round(getPanelOffset(settings, "x"));
    settings.panelOffsetY = Math.round(getPanelOffset(settings, "y"));
    saveSettingsDebounced();
    byId(PANEL_ID)?.querySelector(".st-mimo-window")?.classList.remove("dragging");
    panelDragState = null;
    applyPanelViewport();
}

async function handleClick(event) {
    const floatButton = event.target.closest(`#${FLOAT_ID}`);
    if (floatButton) {
        openPanel();
        return;
    }

    const pageTarget = event.target.closest("[data-mimo-page]");
    if (pageTarget) {
        const settings = getSettings();
        settings.activePage = pageTarget.dataset.mimoPage;
        saveSettings({ render: true });
        return;
    }

    const actionTarget = event.target.closest("[data-mimo-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.mimoAction;

    if (action.startsWith("edit-")) {
        handleEditAction(action, actionTarget.dataset.id);
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
        switch (action) {
            case "open-panel": openPanel(); break;
            case "close-panel": closePanel(); break;
            case "toggle-theme": toggleTheme(); break;
            case "panel-zoom-out": adjustPanelZoom(-0.1); break;
            case "panel-zoom-in": adjustPanelZoom(0.1); break;
            case "panel-reset-view": resetPanelViewport(); break;
            case "export-all": exportAll(); break;
            case "import-all": byId(IMPORT_INPUT_ID)?.click(); break;
            case "add-narrator": addNarrator(); break;
            case "select-all-narrators": selectAllNarrators(); break;
            case "delete-selected-narrators": deleteSelectedNarrators(); break;
            case "add-group": addGroup(); break;
            case "delete-group": deleteActiveGroup(); break;
            case "add-role": addRole(); break;
            case "import-current-character": importCurrentCharacter(); break;
            case "select-all-roles": selectAllRoles(); break;
            case "delete-selected-roles": deleteSelectedRoles(); break;
            case "sync-all": await runSyncSkill({ roleGroup: true, regex: true }); break;
            case "sync-role-group": await runSyncSkill({ roleGroup: true, regex: false }); break;
            case "sync-regex": await runSyncSkill({ roleGroup: false, regex: true }); break;
            case "generate-regex": await syncRegexFromContext({ saveToSt: false }); saveSettings({ render: true }); break;
            case "refresh-regex-list": renderAll(); break;
            case "test-read": await synthesizeAndPlay(getSettings().testText, { attachPreview: true }); break;
            case "read-last": await readLatestAssistantMessage(); break;
            case "player-toggle": await togglePlayerPlayback(); break;
            case "player-prev": await playAdjacentSegment(-1); break;
            case "player-next": await playAdjacentSegment(1); break;
            case "speed-down": adjustPlaybackRate(-TTS_SPEED_RATE_STEP); break;
            case "speed-up": adjustPlaybackRate(TTS_SPEED_RATE_STEP); break;
            case "stop": stopPlayback(); break;
            case "open-audio-folder": await openGeneratedAudioFolder(); break;
            case "toggle-fullscreen": await toggleFullscreen(); break;
            case "insert-inline-tag": insertAtCursor(byId("st-mimo-test-text"), actionTarget.dataset.value); break;
            case "clear-voice-clone-audio": clearProfileVoiceCloneAudio(actionTarget.dataset.profileType); break;
            case "apply-template": applyTemplate(actionTarget.dataset.profileType, actionTarget.dataset.template); break;
            default:
                if (action.startsWith("activate-")) activateProfile(action.replace("activate-", ""), actionTarget.dataset.id);
                break;
        }
    } catch (error) {
        console.error("[MiMo TTS] action failed", action, error);
        notify("error", `${action} 执行失败：${error?.message || error}`);
    }
}

function handleEditAction(action, id) {
    if (action === "edit-narrator") {
        appState.editingNarratorId = id;
        renderAll();
    } else if (action === "edit-group") {
        appState.editingGroupId = id;
        appState.editingRoleId = "";
        appState.selectedRoles.clear();
        renderAll();
    } else if (action === "edit-role") {
        appState.editingRoleId = id;
        renderAll();
    }
}

function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) return;

    if (target.dataset.settingsField) {
        updateSettingsField(target.dataset.settingsField, getInputValue(target));
    } else if (target.dataset.profileField) {
        updateProfileField(target.dataset.profileType, target.dataset.profileField, getInputValue(target));
    } else if (target.dataset.groupField) {
        updateGroupField(target.dataset.groupField, getInputValue(target));
    } else if (target.dataset.regexField) {
        updateRegexField(target.dataset.regexField, getInputValue(target));
    } else if (target.dataset.syncField) {
        updateSyncField(target.dataset.syncField, getInputValue(target));
    }
}

async function handleChange(event) {
    const target = event.target;
    if (target?.id === IMPORT_INPUT_ID) {
        importAll(target.files?.[0]);
        target.value = "";
        return;
    }

    if (target?.dataset?.profileAudio === "voiceClone") {
        try {
            await updateProfileVoiceCloneAudio(target.dataset.profileType, target.files?.[0]);
        } catch (error) {
            console.error("[MiMo TTS] voice clone upload failed", error);
            notify("error", `参考音频载入失败：${error?.message || error}`);
        } finally {
            target.value = "";
        }
        return;
    }

    if (target?.dataset?.mimoSelect) {
        updateSelection(target.dataset.mimoSelect, target.dataset.id, target.checked);
        return;
    }

    if (target?.dataset?.regexPlacement) {
        updateRegexPlacement(Number(target.dataset.regexPlacement), target.checked);
        return;
    }

    if (target?.dataset?.settingsField) {
        updateSettingsField(target.dataset.settingsField, getInputValue(target));
        saveSettings({ render: true });
    } else if (target?.dataset?.profileField) {
        updateProfileField(target.dataset.profileType, target.dataset.profileField, getInputValue(target));
        saveSettings({ render: true });
    } else if (target?.dataset?.groupField) {
        updateGroupField(target.dataset.groupField, getInputValue(target));
        saveSettings({ render: true });
    } else if (target?.dataset?.regexField) {
        updateRegexField(target.dataset.regexField, getInputValue(target));
        saveSettings({ render: true });
    } else if (target?.dataset?.syncField) {
        updateSyncField(target.dataset.syncField, getInputValue(target));
        saveSettings({ render: true });
    }
}

function handleKeydown(event) {
    if (event.key === "Escape" && getSettings().panelOpen) closePanel();
    if (event.key !== "Enter" && event.key !== " ") return;
    const button = event.target.closest(".st-mimo-message-button");
    if (!button) return;
    event.preventDefault();
    const mes = button.closest(".mes");
    if (mes) readMessageElement(mes);
}

function getInputValue(target) {
    if (target instanceof HTMLInputElement && target.type === "checkbox") return target.checked;
    return target.value;
}

function updateSettingsField(field, value) {
    const settings = getSettings();
    settings[field] = value;
    saveSettings();
}

function updateProfileField(type, field, value) {
    const settings = getSettings();
    const profile = getEditableProfile(settings, type);
    if (!profile) return;
    if (field === "aliases") {
        profile[field] = uniqueNames(String(value || "").split(/[,，\n/／]+/));
    } else if (field === "model") {
        profile[field] = normalizeMimoModel(value);
    } else {
        profile[field] = value;
    }
    profile.updatedAt = new Date().toISOString();
    saveSettings();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("参考音频读取失败。"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
    });
}

function getVoiceCloneAudioMime(file) {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (type.includes("mpeg") || type.includes("mp3") || name.endsWith(".mp3")) return "audio/mpeg";
    if (type.includes("wav") || name.endsWith(".wav")) return "audio/wav";
    return "";
}

async function updateProfileVoiceCloneAudio(type, file) {
    if (!file) return;
    const mime = getVoiceCloneAudioMime(file);
    if (!mime) {
        notify("warning", "参考音频只支持 wav 或 mp3。");
        return;
    }
    if (file.size > VOICE_CLONE_AUDIO_MAX_BYTES) {
        notify("warning", `参考音频不能超过 ${Math.round(VOICE_CLONE_AUDIO_MAX_BYTES / 1024 / 1024)}MB。`);
        return;
    }
    const settings = getSettings();
    const profile = getEditableProfile(settings, type);
    if (!profile) return;
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : dataUrl;
    profile.voiceCloneAudioData = `data:${mime};base64,${base64}`;
    profile.voiceCloneAudioName = file.name || "reference-audio";
    profile.voiceCloneAudioMime = mime;
    profile.updatedAt = new Date().toISOString();
    saveSettings({ render: true });
    notify("info", `已载入参考音频：${profile.voiceCloneAudioName}`);
}

function clearProfileVoiceCloneAudio(type) {
    const settings = getSettings();
    const profile = getEditableProfile(settings, type);
    if (!profile) return;
    profile.voiceCloneAudioData = "";
    profile.voiceCloneAudioName = "";
    profile.voiceCloneAudioMime = "";
    profile.updatedAt = new Date().toISOString();
    saveSettings({ render: true });
}

function updateGroupField(field, value) {
    const settings = getSettings();
    const group = getGroup(settings, appState.editingGroupId);
    if (!group) return;
    group[field] = value;
    group.updatedAt = new Date().toISOString();
    saveSettings();
}

function updateRegexField(field, value) {
    const settings = getSettings();
    settings.regex[field] = value;
    saveSettings();
}

function updateSyncField(field, value) {
    const settings = getSettings();
    settings.syncSkill[field] = value;
    saveSettings();
}

function updateRegexPlacement(placement, checked) {
    const settings = getSettings();
    const placements = new Set(settings.regex.placement || []);
    if (checked) placements.add(placement);
    else placements.delete(placement);
    settings.regex.placement = Array.from(placements).sort((a, b) => a - b);
    saveSettings({ render: true });
}

function getEditableProfile(settings, type) {
    if (type === "narrator") return getNarrator(settings, appState.editingNarratorId);
    const group = getGroup(settings, appState.editingGroupId);
    return getRole(group, appState.editingRoleId);
}

function openPanel() {
    const settings = getSettings();
    settings.panelOpen = true;
    saveSettings({ render: true });
}

function closePanel() {
    const settings = getSettings();
    settings.panelOpen = false;
    saveSettings({ render: true });
}

function toggleTheme() {
    const settings = getSettings();
    settings.uiTheme = settings.uiTheme === "dark" ? "light" : "dark";
    saveSettings({ render: true });
}

function addNarrator() {
    const settings = getSettings();
    const narrator = createProfile("narrator", { name: "新旁白", displayId: `NARRATOR-${settings.libraries.narrators.length + 1}` });
    settings.libraries.narrators.push(narrator);
    appState.editingNarratorId = narrator.uid;
    appState.selectedNarrators.clear();
    saveSettings({ render: true });
}

function selectAllNarrators() {
    const settings = getSettings();
    const allSelected = settings.libraries.narrators.every((profile) => appState.selectedNarrators.has(profile.uid));
    appState.selectedNarrators.clear();
    if (!allSelected) settings.libraries.narrators.forEach((profile) => appState.selectedNarrators.add(profile.uid));
    renderAll();
}

function deleteSelectedNarrators() {
    const settings = getSettings();
    if (!appState.selectedNarrators.size) return;
    settings.libraries.narrators = settings.libraries.narrators.filter((profile) => {
        if (profile.displayId === FIXED_NARRATOR_DISPLAY_ID) return true;
        return !appState.selectedNarrators.has(profile.uid);
    });
    appState.selectedNarrators.clear();
    const fixedNarrator = ensureFixedNarrator(settings);
    appState.editingNarratorId = fixedNarrator.uid;
    if (settings.activeProfile.type === "narrator" && !getNarrator(settings, settings.activeProfile.narratorId)) {
        settings.activeProfile.narratorId = fixedNarrator.uid;
    }
    saveSettings({ render: true });
}

function addGroup() {
    const settings = getSettings();
    const group = createGroup({ name: "新角色组", displayId: `GROUP-${settings.libraries.roleGroups.length + 1}` });
    settings.libraries.roleGroups.push(group);
    appState.editingGroupId = group.uid;
    appState.editingRoleId = "";
    appState.selectedRoles.clear();
    saveSettings({ render: true });
}

function deleteActiveGroup() {
    const settings = getSettings();
    if (!appState.editingGroupId) return;
    settings.libraries.roleGroups = settings.libraries.roleGroups.filter((group) => group.uid !== appState.editingGroupId);
    const nextGroup = settings.libraries.roleGroups[0];
    appState.editingGroupId = nextGroup?.uid || "";
    appState.editingRoleId = nextGroup?.roles?.[0]?.uid || "";
    appState.selectedRoles.clear();
    if (settings.activeProfile.type === "role" && !getGroup(settings, settings.activeProfile.groupId)) {
        settings.activeProfile = {
            type: "narrator",
            narratorId: settings.libraries.narrators[0]?.uid || "",
            groupId: "",
            roleId: "",
        };
    }
    saveSettings({ render: true });
}

function addRole(seed = {}) {
    const settings = getSettings();
    let group = getGroup(settings, appState.editingGroupId);
    if (!group) {
        group = createGroup({ name: "默认角色组" });
        settings.libraries.roleGroups.push(group);
        appState.editingGroupId = group.uid;
    }
    const role = createProfile("role", {
        name: seed.name || "新角色",
        displayId: seed.displayId || `ROLE-${group.roles.length + 1}`,
        ...seed,
    });
    group.roles.push(role);
    appState.editingRoleId = role.uid;
    appState.selectedRoles.clear();
    saveSettings({ render: true });
    return role;
}

function selectAllRoles() {
    const settings = getSettings();
    const group = getGroup(settings, appState.editingGroupId);
    if (!group) return;
    const allSelected = group.roles.every((profile) => appState.selectedRoles.has(profile.uid));
    appState.selectedRoles.clear();
    if (!allSelected) group.roles.forEach((profile) => appState.selectedRoles.add(profile.uid));
    renderAll();
}

function deleteSelectedRoles() {
    const settings = getSettings();
    const group = getGroup(settings, appState.editingGroupId);
    if (!group || !appState.selectedRoles.size) return;
    group.roles = group.roles.filter((profile) => !appState.selectedRoles.has(profile.uid));
    appState.selectedRoles.clear();
    appState.editingRoleId = group.roles[0]?.uid || "";
    if (settings.activeProfile.type === "role" && !getRole(group, settings.activeProfile.roleId)) {
        settings.activeProfile = {
            type: "narrator",
            narratorId: settings.libraries.narrators[0]?.uid || "",
            groupId: "",
            roleId: "",
        };
    }
    saveSettings({ render: true });
}

function updateSelection(type, id, checked) {
    const set = type === "narrator" ? appState.selectedNarrators : appState.selectedRoles;
    if (checked) set.add(id);
    else set.delete(id);
}

function activateProfile(type, id) {
    const settings = getSettings();
    const fixedNarrator = ensureFixedNarrator(settings);
    if (type === "narrator") {
        const narrator = getNarrator(settings, id || appState.editingNarratorId) || fixedNarrator;
        if (!narrator) return;
        settings.activeProfile = { type: "narrator", narratorId: fixedNarrator.uid, groupId: "", roleId: "" };
    } else {
        const group = getGroup(settings, appState.editingGroupId);
        const role = getRole(group, id || appState.editingRoleId);
        if (!group || !role) return;
        appState.editingGroupId = group.uid;
        appState.editingRoleId = role.uid;
        settings.activeProfile = { type: "narrator", narratorId: fixedNarrator.uid, groupId: "", roleId: "" };
        notify("info", "播放器已固定使用14岁女高中生旁白，角色音色不会被设为朗读音色。");
    }
    saveSettings({ render: true });
}

function applyTemplate(type, key) {
    const settings = getSettings();
    const profile = getEditableProfile(settings, type);
    const template = DESIGN_TEMPLATES[key];
    if (!profile || !template) return;
    profile.voiceDesignPrompt = template;
    profile.updatedAt = new Date().toISOString();
    saveSettings({ render: true });
}

function importCurrentCharacter() {
    const character = getCurrentCharacterCard();
    if (!character) {
        notify("warning", "没有找到当前角色卡。");
        return;
    }

    addRole({
        name: character.name || "当前角色",
        displayId: `CHAR-${Date.now().toString(36).toUpperCase()}`,
        avatar: character.avatar || "",
        sourceCharacter: character.name || "",
        director: buildCharacterDirector(character),
        voiceDesignPrompt: buildCharacterVoicePrompt(character),
        styleRole: buildCharacterDirector(character),
        styleScene: "从当前 SillyTavern 角色卡导入，按当前正文场景自然说话。",
        styleGuidance: `只朗读 ${character.name || "当前角色"} 的台词正文。不要读角色名、格式标签、图片提示词、系统说明或 Markdown 控制符。按文本情绪自然变化，不要扩写原文。`,
        notes: "从当前 SillyTavern 角色卡导入。",
    });
}

function getCurrentCharacterCard() {
    const context = safeGetContext();
    const candidates = [
        context?.characters?.[context?.characterId],
        context?.characters?.[context?.this_chid],
        Array.isArray(context?.characters) && Number.isInteger(Number(context?.chid)) ? context.characters[Number(context.chid)] : null,
    ].filter(Boolean);
    return candidates[0] || null;
}

function buildCharacterDirector(character) {
    const parts = [
        character.personality && `性格：${character.personality}`,
        character.scenario && `场景：${character.scenario}`,
        character.description && `设定：${character.description}`,
    ].filter(Boolean);
    return parts.join("\n\n").slice(0, 2000);
}

function buildCharacterVoicePrompt(character) {
    const name = character.name || "角色";
    const description = [character.description, character.personality].filter(Boolean).join("\n");
    return `性别与年龄：根据角色卡中关于 ${name} 的性别、年龄、身份与阅历判断；如果没有明写，就从说话习惯和人物气质中保守推断，不要创造与角色卡冲突的年龄感。
音色/质感：贴合 ${name} 的身份、身体状态、气质与性格底色，明确区分旁白声线；声音要像角色本人，不要像通用播音员。
情绪/语气：以角色卡人格为默认情绪底色，根据台词微调情绪强弱，保持自然可信。
语速/节奏：根据角色的性格、身份和当前台词决定语速、停顿、重音和咬字，不要机械匀速朗读。

角色/人设：${name}，SillyTavern 当前角色库中的角色。
说话风格：延续角色卡写明的口癖、措辞、礼貌程度、攻击性或亲密感；不要把角色台词读成旁白。
场景描写：在当前 SillyTavern 对话中自然说话，回应对象是用户或其他角色，语音需要符合正文场景。
年代参照：遵循角色卡与世界书设定的时代和题材，不要额外加入不相关的复古腔、新闻腔或动漫腔。

角色：${name}。根据角色卡设定生成适合该角色的声线，保持身份、年龄感、性格和说话习惯一致。

场景：在 SillyTavern 当前对话中自然说话，回应对象是聊天中的用户或其他角色。

指导：
请从角色设定中推断性别年龄、音色质感、情绪底色和语速节奏。不要像播音腔，要像角色本人在现场说话。
- 声线：与旁白明显区分，稳定复现同一角色的声音特征。
- 表演：台词优先，少量带入情绪，不要过度夸张。
- 节奏：短句自然，长句按语义停顿。

角色卡参考：
${description.slice(0, 1200)}`;
}

async function runSyncSkill(options = {}) {
    const settings = getSettings();
    const resultParts = [];
    const contextData = await collectCurrentContextData();

    if (options.roleGroup) {
        const groupResult = upsertRoleGroupFromContext(settings, contextData);
        resultParts.push(`角色组库：${groupResult.group.name}，${groupResult.roleCount} 个角色`);
    }

    if (options.regex) {
        const regexResult = await syncRegexFromContext({
            contextData,
            saveToSt: false,
        });
        resultParts.push(`正则：${regexResult.scriptName}`);
    }

    settings.syncSkill.lastSyncAt = new Date().toISOString();
    settings.syncSkill.lastCharacterName = contextData.currentCharacter?.name || "";
    settings.syncSkill.lastWorldNames = contextData.worldNames;
    settings.syncSkill.lastRoleCount = getActiveSyncGroup(settings, contextData)?.roles?.length || 0;
    settings.syncSkill.lastSummary = resultParts.join("；") || "没有可同步内容。";
    saveSettings({ render: true });
    notify("info", settings.syncSkill.lastSummary);
}

async function collectCurrentContextData() {
    const context = safeGetContext();
    const currentCharacter = getCurrentCharacterCard() || characters?.[this_chid] || null;
    const groupMembers = getCurrentGroupCharacters(context);
    const chatNames = collectChatNames(context);
    const worldNames = getCurrentWorldNames(currentCharacter);
    const worldFragments = await collectWorldFragments(worldNames);
    const embeddedBookFragments = collectObjectStrings(currentCharacter?.data?.character_book || currentCharacter?.data?.extensions?.world_info);
    const recentChatRawText = collectRecentChatRawText(context);
    const recentChatText = recentChatRawText.map(stripHtml);
    const sourceText = [
        currentCharacter?.name,
        currentCharacter?.description,
        currentCharacter?.personality,
        currentCharacter?.scenario,
        currentCharacter?.first_mes,
        currentCharacter?.mes_example,
        ...worldFragments.map((entry) => entry.text),
        ...embeddedBookFragments,
        ...recentChatText,
    ].filter(Boolean).join("\n\n");

    const roleNames = collectConfirmedRoleNames({
        currentCharacter,
        groupMembers,
        chatNames,
        sourceText,
    });

    return {
        context,
        currentCharacter,
        groupMembers,
        chatNames,
        worldNames,
        worldFragments,
        recentChatRawText,
        recentChatText,
        sourceText,
        roleNames,
    };
}

function collectConfirmedRoleNames(data) {
    const currentName = data.currentCharacter?.name;
    const bracketNames = collectBracketRoleNamesFromText(data.sourceText);
    const names = [
        isScenarioContainerName(currentName) ? null : currentName,
        ...data.groupMembers.map((character) => character?.name),
        ...data.chatNames,
        ...collectPersistentExplicitSpeakerNamesFromText(data.sourceText),
        ...bracketNames,
        ...getReferencedCharacterCardNames(data.sourceText, currentName),
    ];
    return uniqueNames(names.map(resolvePreferredRoleName)).filter(isRoleName);
}

function isScenarioContainerName(name) {
    const value = cleanRoleName(name);
    return /(?:\d+\.\d+|ver|版本|世界书|剧情|设定|演艺圈|角色卡)$/iu.test(value);
}

function collectExplicitSpeakerNamesFromText(text) {
    const source = String(text || "");
    const names = [];
    for (const match of source.matchAll(/@bubble:([^|\n]{1,28})\|[^|\n]*\|/giu)) {
        names.push(match[1]);
    }
    return names;
}

function collectPersistentExplicitSpeakerNamesFromText(text) {
    return collectExplicitSpeakerNamesFromText(text)
        .map(resolvePreferredRoleName)
        .filter((name) => findKnownRolePreset(name) || findCharacterByName(name));
}

function collectBracketRoleNamesFromText(text) {
    const source = String(text || "");
    const names = [];
    const pattern = /^\s*\[([A-Za-z][\w-]{1,40})\]\s*[（(]([^)\n）]{1,50})[）)]/gmu;
    for (const match of source.matchAll(pattern)) {
        const preset = findKnownRolePreset(match[1]) || findKnownRolePreset(match[2]);
        if (preset) {
            names.push(preset.name);
            continue;
        }
        const primaryName = String(match[2] || "").split(/[\/／]/)[0].trim();
        if (primaryName && findCharacterByName(primaryName)) names.push(primaryName);
    }
    return names;
}

function collectPersistentBracketRoleNamesFromText(text) {
    return collectBracketRoleNamesFromText(text)
        .map(resolvePreferredRoleName)
        .filter((name) => findKnownRolePreset(name) || findCharacterByName(name));
}

function findKnownRolePreset(value) {
    const key = roleNameKey(value);
    if (!key) return null;
    return KNOWN_ROLE_VOICE_PRESETS.find((preset) => {
        const values = [preset.id, preset.name, ...(preset.aliases || [])];
        return values.some((item) => roleNameKey(item) === key);
    }) || null;
}

function resolvePreferredRoleName(value) {
    return findKnownRolePreset(value)?.name || value;
}

function getReferencedCharacterCardNames(text, currentName = "") {
    const source = String(text || "");
    if (!source) return [];
    return (Array.isArray(characters) ? characters : [])
        .map((character) => character?.name)
        .filter((name) => isRoleName(name) && name !== currentName && roleNameAppearsInText(name, source));
}

function roleNameAppearsInText(name, text) {
    const value = cleanRoleName(name);
    if (!value) return false;
    if (/^[\p{Script=Han}]+$/u.test(value)) {
        return String(text || "").includes(value);
    }
    const escaped = escapeRegexLiteral(value);
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu").test(String(text || ""));
}

function getCurrentGroupCharacters(context) {
    const groupId = context?.groupId;
    const group = groupId ? context?.groups?.find((item) => item.id == groupId) : null;
    if (!group?.members?.length) return [];
    return group.members
        .map((avatar) => characters?.find((character) => character.avatar === avatar))
        .filter(Boolean);
}

function collectChatNames(context) {
    return uniqueNames((context?.chat || [])
        .filter((message) => !message?.is_user && !message?.is_system)
        .map((message) => message?.name)
        .filter(Boolean));
}

function collectRecentChatText(context) {
    return collectRecentChatRawText(context).map(stripHtml);
}

function collectRecentChatRawText(context) {
    return (context?.chat || [])
        .slice(-80)
        .map((message) => String(message?.mes || ""))
        .filter(Boolean);
}

function getCurrentWorldNames(currentCharacter) {
    return uniqueNames([
        ...(Array.isArray(selected_world_info) ? selected_world_info : []),
        currentCharacter?.data?.extensions?.world,
        currentCharacter?.extensions?.world,
        currentCharacter?.data?.world,
        currentCharacter?.world,
        currentCharacter?.data?.character_book?.name,
    ]).filter(Boolean);
}

async function collectWorldFragments(worldNames) {
    const fragments = [];
    for (const worldName of worldNames) {
        try {
            const data = await loadWorldInfo(worldName);
            const strings = collectObjectStrings(data);
            strings.forEach((text) => fragments.push({ worldName, text }));
        } catch (error) {
            console.warn(`[MiMo TTS] Failed to load world info: ${worldName}`, error);
        }
    }
    return fragments;
}

function collectObjectStrings(value, depth = 0) {
    if (depth > 5 || value == null) return [];
    if (typeof value === "string") {
        const text = value.trim();
        return text ? [text] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectObjectStrings(item, depth + 1));
    }
    if (!isPlainObject(value)) return [];

    const preferredKeys = ["content", "comment", "key", "keysecondary", "keys", "name", "description", "personality", "scenario"];
    const values = [];
    for (const key of preferredKeys) {
        if (value[key] !== undefined) values.push(...collectObjectStrings(value[key], depth + 1));
    }
    if (!values.length) {
        for (const item of Object.values(value)) values.push(...collectObjectStrings(item, depth + 1));
    }
    return values;
}

function cleanRoleName(value) {
    return String(value || "")
        .replace(/[「」"“”'‘’]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 28);
}

function isRoleName(name) {
    const value = cleanRoleName(name);
    if (!value || value.length < 1 || value.length > 28) return false;
    if (/^(user|assistant|system|旁白|叙述|Narrator|narrator|你|我|他|她|它)$/u.test(value)) return false;
    if (/^(上午|下午|中午|晚上|早上|凌晨|今天|昨天|明天|现在|刚才|以后|之前|之后|前言|正文|提示词|负面提示词|角色名|别名|示例|格式|正则|脚本|标签|content|image|prompt|regex)$/iu.test(value)) return false;
    if (/[\\^$*+?{}[\]().|/<>=%]/u.test(value)) return false;
    if (/^[\d\s:：,.，。;；!?！？-]+$/.test(value)) return false;
    return true;
}

function uniqueNames(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const name = cleanRoleName(value);
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        result.push(name);
    }
    return result;
}

function upsertRoleGroupFromContext(settings, contextData) {
    const currentName = contextData.currentCharacter?.name || "当前角色卡";
    const groupName = `${currentName}角色组库`;
    const displayId = `GROUP-${sanitizeId(currentName)}`;
    let group = settings.libraries.roleGroups.find((item) => item.displayId === displayId || item.name === groupName);

    if (!group) {
        group = createGroup({
            displayId,
            name: groupName,
            sourceCharacter: currentName,
            sourceWorlds: contextData.worldNames,
            syncSource: "current-character-worldbook",
        });
        settings.libraries.roleGroups.push(group);
    }

    group.name = groupName;
    group.displayId = displayId;
    group.sourceCharacter = currentName;
    group.sourceWorlds = contextData.worldNames;
    group.syncSource = "current-character-worldbook";
    group.director = buildGroupDirector(contextData);
    group.notes = `由 MiMo 同步技能根据当前角色卡、当前群组、聊天说话人和已存在角色卡生成。\n世界书：${contextData.worldNames.join(" / ") || "无"}`;
    group.lastSyncedAt = new Date().toISOString();
    group.updatedAt = group.lastSyncedAt;

    const roleNames = uniqueNames(contextData.roleNames.map(resolvePreferredRoleName)).filter(isRoleName);
    const authoritativeRoleNames = getAuthoritativeRoleLibraryNames(contextData.sourceText);
    const shouldPruneGeneratedRoles = authoritativeRoleNames.length >= 4;
    const syncRoleNames = uniqueNames((shouldPruneGeneratedRoles ? authoritativeRoleNames : roleNames)
        .map(resolvePreferredRoleName))
        .filter(isRoleName);

    if (shouldPruneGeneratedRoles) {
        const syncedKeys = new Set(syncRoleNames.map(roleNameKey));
        group.roles = group.roles.filter((role) => syncedKeys.has(roleNameKey(role.name)) || !isGeneratedSyncRole(role));
    }

    for (const roleName of syncRoleNames) {
        const character = findCharacterByName(roleName);
        const existing = group.roles.find((role) => roleNameKey(role.name) === roleNameKey(roleName) || roleNameKey(role.sourceCharacter) === roleNameKey(roleName));
        const seed = buildRoleSeed(roleName, character, contextData);
        if (existing) {
            mergeSyncedRole(existing, seed);
        } else {
            group.roles.push(createProfile("role", seed));
        }
    }

    appState.editingGroupId = group.uid;
    if (!getRole(group, appState.editingRoleId)) appState.editingRoleId = group.roles[0]?.uid || "";
    return { group, roleCount: group.roles.length };
}

function getAuthoritativeRoleLibraryNames(text) {
    const names = collectBracketRoleNamesFromText(text);
    const knownNames = names.filter((name) => findKnownRolePreset(name));
    if (knownNames.length >= 4) return uniqueNames(knownNames.map(resolvePreferredRoleName)).filter(isRoleName);
    if (names.length >= 6) return uniqueNames(names.map(resolvePreferredRoleName)).filter(isRoleName);
    return [];
}

function roleNameKey(value) {
    return cleanRoleName(value).toLocaleLowerCase();
}

function isGeneratedSyncRole(role) {
    return Boolean(role?.syncGenerated)
        || String(role?.syncSource || "").startsWith("mimo-")
        || /MiMo 同步技能|同步片段/.test(String(role?.notes || ""))
        || /^从当前正文和世界书中识别到的角色/.test(String(role?.director || ""));
}

function mergeSyncedRole(existing, seed) {
    const generated = isGeneratedSyncRole(existing);
    const preserved = { uid: existing.uid, createdAt: existing.createdAt };
    if (generated) {
        Object.assign(existing, seed, preserved);
    } else {
        for (const field of ["displayId", "aliases", "avatar", "sourceCharacter", "director", "voiceDesignPrompt", "deliveryInstruction", "stylePrefix", "styleRole", "styleScene", "styleGuidance", "notes"]) {
            if (field === "aliases") {
                if ((!Array.isArray(existing.aliases) || !existing.aliases.length) && Array.isArray(seed.aliases)) existing.aliases = seed.aliases;
                continue;
            }
            if (!existing[field] && seed[field]) existing[field] = seed[field];
        }
        existing.syncSource = existing.syncSource || seed.syncSource;
    }
    existing.syncGenerated = generated || Boolean(existing.syncGenerated);
    existing.lastSyncedAt = seed.lastSyncedAt;
    existing.updatedAt = new Date().toISOString();
}

function getActiveSyncGroup(settings, contextData) {
    const currentName = contextData.currentCharacter?.name || "";
    const displayId = `GROUP-${sanitizeId(currentName || "当前角色卡")}`;
    return settings.libraries.roleGroups.find((item) => item.displayId === displayId) || getGroup(settings, appState.editingGroupId);
}

function buildRoleSeed(roleName, character, contextData) {
    const preset = findKnownRolePreset(roleName);
    const resolvedRoleName = preset?.name || roleName;
    const snippets = findSnippetsForName(roleName, contextData.sourceText).slice(0, 6).join("\n");
    return {
        displayId: preset?.id || `ROLE-${sanitizeId(resolvedRoleName)}`,
        name: resolvedRoleName,
        aliases: preset ? uniqueNames([preset.id, ...(preset.aliases || [])]).filter((name) => roleNameKey(name) !== roleNameKey(resolvedRoleName)) : [],
        avatar: character?.avatar || "",
        sourceCharacter: character?.name || preset?.id || resolvedRoleName,
        director: preset ? buildKnownRoleDirector(preset, snippets) : (character ? buildCharacterDirector(character) : `从当前角色卡、群聊或聊天说话人中确认的角色：${resolvedRoleName}。`),
        voiceDesignPrompt: preset ? buildKnownRoleVoicePrompt(preset, snippets) : (character ? buildCharacterVoicePrompt(character) : buildRoleVoicePrompt(resolvedRoleName, snippets)),
        deliveryInstruction: `只朗读 ${resolvedRoleName} 的台词正文。不要读角色名、@bubble 标签、情绪标签、图片提示词、系统说明或 Markdown 控制符。保持该角色的固定声线，不要切换成旁白。可按 @bubble 或文本情绪使用 MiMo 音频标签控制语气，但不要扩写原文。`,
        stylePrefix: "",
        styleRole: preset
            ? `${preset.name}。${preset.persona} 声线参考：${preset.age}；${preset.texture}`
            : `${resolvedRoleName}。${character ? buildCharacterDirector(character) : "从当前角色卡、群聊或聊天说话人中确认的角色。"}`,
        styleScene: snippets ? `当前上下文片段：\n${snippets}` : "在当前 SillyTavern 正文场景中自然说话。",
        styleGuidance: `只朗读 ${resolvedRoleName} 的台词正文。不要读角色名、@bubble 标签、情绪标签、图片提示词、系统说明或 Markdown 控制符。保持该角色的固定声线，不要切换成旁白；可按 @bubble 或文本情绪使用 MiMo 音频标签控制语气，但不要扩写原文。`,
        model: MIMO_MODELS.VOICE_DESIGN,
        format: "wav",
        optimizeTextPreview: false,
        notes: snippets ? `同步片段：\n${snippets}` : "由 MiMo 同步技能自动生成。",
        syncGenerated: true,
        syncSource: "mimo-current-context",
        lastSyncedAt: new Date().toISOString(),
    };
}

function buildKnownRoleDirector(preset, snippets) {
    return `从当前角色卡/世界书明确条目确认的角色：${preset.name}（${preset.id}）。
别名：${(preset.aliases || []).join(" / ")}
${preset.libraryProfile ? `${preset.libraryProfile}\n` : ""}人设：${preset.persona}
说话风格：${preset.style}
共性要求：严格参考角色库年龄、身份和气质；保持年轻、自然、生活化，避免老太太声、成年厚嗓、播音腔和有声书腔；同时每个角色要按自己的音色、节奏和情绪明显区分。
注意：这是 SillyTavern 角色声线设定，不做真人声音克隆，不模仿现实中任何真人的真实声纹。${snippets ? `\n\n同步片段：\n${String(snippets).slice(0, 800)}` : ""}`;
}

function buildKnownRoleVoicePrompt(preset, snippets) {
    return `性别与年龄：${preset.age}。
音色/质感：${preset.texture}
情绪/语气：${preset.emotion}
语速/节奏：${preset.pace}

角色/人设：${preset.persona}
说话风格：${preset.style}
场景描写：${preset.scene}
年代参照：当前世界书的 2019 年演艺圈设定；语气现代、生活化，不要新闻播音腔、朗诵腔、评书腔或夸张动漫腔。
角色库依据：${preset.libraryProfile || "当前角色卡/世界书中的明确角色条目。"}

角色：${preset.name}。这是 SillyTavern 角色卡中的角色声线，不是现实真人声音克隆；只根据角色卡文字设定生成可区分的角色化声音。

场景：她在当前 SillyTavern 正文中自然说话，可能与郑祺、其他角色或旁白互动。声音要像现场台词，不要像旁白替她朗读。

指导：
保持角色固定声线，并根据 @bubble 情绪、文本标点和台词内容自然变化。正文是什么就读什么，不要扩写、不添加台词。
- 角色一致性：严格参考上面的角色库依据，年龄感、身份感、气质和说话习惯不能漂移；未成年角色保持年龄合适的少年/少女感，不要成熟化、性感化或暧昧化。
- 年轻化：所有角色都必须保持年轻、自然、生活化，禁止老太太声、成年厚嗓、播音腔、有声书腔、新闻腔。
- 差异化：甜妹、清冷、直球、明艳、轻软、冷酷、清透、英气、甜嗓、沉稳、文艺、日系清透这些风格要明显分开，不要听起来同一个声音。
- 声线：与固定旁白明显区分，同一角色前后稳定。
- 情绪：开心、吐槽、疲惫、紧张、委屈、惊讶等要有轻微变化；不要全程平板。
- 节奏：短对白自然利落，长句按语义停顿。

参考片段：
${String(snippets || "").slice(0, 1200)}`;
}

function buildRoleVoicePrompt(roleName, snippets) {
    return `性别与年龄：根据世界书和正文中关于 ${roleName} 的身份、称谓、行为和说话习惯保守推断；不确定时保持中性自然，不要编造明确年龄。
音色/质感：从角色气质推断声线质感，让声音和旁白、其他角色有可辨识差异；避免通用播音腔。
情绪/语气：以参考片段中的情绪和人际关系为底色，台词有角色感，但不要过度表演。
语速/节奏：按角色说话习惯与台词内容决定，紧张时略快，压抑时略慢，长句按语义停顿。

角色/人设：${roleName}，从当前角色卡、世界书、聊天说话人或明确 @bubble 标签中确认的角色。
说话风格：贴合参考片段中的措辞、礼貌程度、亲密感、攻击性、疲惫感或幽默感。
场景描写：在当前 SillyTavern 正文场景中说话，与用户、旁白或其他角色自然衔接。
年代参照：遵循当前世界书和角色卡的时代题材，不额外加入新闻联播腔、译制片腔或夸张动漫腔。

角色：${roleName}。根据当前正文和世界书推断该角色的年龄感、性格底色、说话习惯和声线。

场景：在当前 SillyTavern 对话中自然说话，保持与正文上下文一致。

指导：
音色要与角色身份贴合，语气自然，有角色感，不要播音腔。根据台词判断语速、情绪强度和咬字风格。
- 声线：稳定、可复现，与固定旁白不同。
- 表演：只服务台词，不抢戏。
- 节奏：短对白利落，长对白按语义自然停顿。

参考片段：
${String(snippets || "").slice(0, 1200)}`;
}

function buildGroupDirector(contextData) {
    const charName = contextData.currentCharacter?.name || "当前角色卡";
    return `当前角色卡：${charName}
世界书：${contextData.worldNames.join(" / ") || "无"}
规则：优先按角色名前缀、当前角色卡设定、世界书条目和最近正文识别说话人。未匹配到角色时使用当前旁白。`;
}

function findCharacterByName(name) {
    const key = cleanRoleName(name).toLocaleLowerCase();
    return characters?.find((character) => cleanRoleName(character?.name).toLocaleLowerCase() === key) || null;
}

function findSnippetsForName(name, text) {
    const source = String(text || "");
    const preset = findKnownRolePreset(name);
    const aliasKeys = new Set(uniqueNames([
        name,
        preset?.id,
        preset?.name,
        ...(preset?.aliases || []),
    ]).map(roleNameKey));

    const roleBlockPattern = /^\s*\[([A-Za-z][\w-]{1,40})\]\s*[（(]([^)\n）]{1,50})[）)]([\s\S]*?)(?=^\s*\[[A-Za-z][\w-]{1,40}\]\s*[（(][^)\n）]{1,50}[）)]|\n\s*(?:\[System Instruction:|AI核心指令:|<%|<[^>\n]{1,60}>|##?\s)|$)/gmu;
    const roleBlocks = [];
    for (const match of source.matchAll(roleBlockPattern)) {
        const blockNames = uniqueNames([
            match[1],
            ...String(match[2] || "").split(/[\/／]/),
            findKnownRolePreset(match[1])?.name,
            findKnownRolePreset(match[2])?.name,
        ]);
        if (!blockNames.some((value) => aliasKeys.has(roleNameKey(value)))) continue;
        const snippet = sanitizeRoleSnippet(match[0]);
        if (snippet) roleBlocks.push(snippet);
    }
    if (roleBlocks.length) return roleBlocks.slice(0, 3);

    const aliases = Array.from(aliasKeys).filter(Boolean);
    const fallbackMatches = [];
    for (const key of aliases) {
        const escaped = escapeRegexLiteral(key);
        const regex = new RegExp(`[^\\n。！？.!?]{0,50}${escaped}[^\\n。！？.!?]{0,120}`, "giu");
        fallbackMatches.push(...Array.from(source.matchAll(regex)).map((match) => match[0].trim()));
    }
    return uniqueStrings(fallbackMatches)
        .map(sanitizeRoleSnippet)
        .filter(Boolean);
}

function sanitizeRoleSnippet(snippet) {
    const riskyPattern = /情色|色情|性爱|性暗示|猥琐|痴汉|偷窥|裸|内衣|胸|臀|交媾|呻吟|强制窘境|Inevitable Erotic Script Protocol|System Instruction|AI核心指令/iu;
    const source = String(snippet || "")
        .split(/\n\s*(?:\[System Instruction:|AI核心指令:|第一部分：|第二部分：|<%|##?\s)/u)[0]
        .replace(/<%[\s\S]*?%>/g, " ")
        .trim();
    return source
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !riskyPattern.test(line))
        .join("\n")
        .slice(0, 900)
        .trim();
}

function uniqueStrings(values) {
    const seen = new Set();
    return values
        .map((value) => String(value || "").trim())
        .filter((value) => {
            const key = String(value || "").toLocaleLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function sanitizeId(value) {
    return String(value || "CURRENT")
        .trim()
        .replace(/[^\p{Script=Han}A-Za-z0-9_-]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase()
        .slice(0, 48) || "CURRENT";
}

async function syncRegexFromContext(options = {}) {
    const settings = getSettings();
    const contextData = options.contextData || await collectCurrentContextData();
    const boundaries = detectTextBoundaries(contextData);

    settings.regex.scriptName = `${MIMO_REGEX_PREFIX} - 通用正文边界过滤`;
    Object.assign(settings.regex, boundaries);
    settings.regex.stripBubbleTags = true;
    settings.regex.findRegex = buildBoundaryRegexSummary(settings.regex);
    settings.regex.replaceString = "$1";
    settings.regex.previewText = buildRegexPreviewText(settings.regex, contextData);
    settings.syncSkill.lastRegexName = settings.regex.scriptName;

    return { scriptName: settings.regex.scriptName, boundaries };
}

function detectTextBoundaries(contextData) {
    const sampleText = [
        ...(contextData.recentChatRawText || collectRecentChatRawText(contextData.context)),
        contextData.currentCharacter?.first_mes,
        contextData.currentCharacter?.mes_example,
    ].filter(Boolean).join("\n\n");
    const include = findFirstTagPair(sampleText, [
        ["<content>", "</content>"],
        ["<正文>", "</正文>"],
        ["<body>", "</body>"],
        ["<message>", "</message>"],
        ["[content]", "[/content]"],
    ]);
    const exclude = findFirstTagPair(sampleText, [
        ["<image>", "</image>"],
        ["<图片>", "</图片>"],
        ["<prompt>", "</prompt>"],
        ["<negative>", "</negative>"],
        ["<thinking>", "</thinking>"],
        ["<reasoning>", "</reasoning>"],
        ["[image]", "[/image]"],
    ]);

    return {
        contentOnlyEnabled: Boolean(include),
        contentStartTag: include?.[0] || settingsRegexFallback("contentStartTag"),
        contentEndTag: include?.[1] || settingsRegexFallback("contentEndTag"),
        excludeStartTag: exclude?.[0] || settingsRegexFallback("excludeStartTag"),
        excludeEndTag: exclude?.[1] || settingsRegexFallback("excludeEndTag"),
    };
}

function settingsRegexFallback(field) {
    const value = getSettings().regex?.[field];
    return value || DEFAULT_REGEX_SETTINGS[field];
}

function findFirstTagPair(text, pairs) {
    const source = String(text || "");
    return pairs.find(([start, end]) => source.includes(start) && source.includes(end)) || null;
}

function buildBoundaryRegexSummary(regexSettings) {
    const include = regexSettings.contentOnlyEnabled
        ? `include ${regexSettings.contentStartTag || ""} ... ${regexSettings.contentEndTag || ""}`
        : "include disabled";
    const exclude = regexSettings.excludeStartTag && regexSettings.excludeEndTag
        ? `exclude ${regexSettings.excludeStartTag} ... ${regexSettings.excludeEndTag}`
        : "exclude disabled";
    const controls = regexSettings.stripBubbleTags === false
        ? "control-strip disabled"
        : "strip @bubble:name|emotion|, code blocks, image/thinking/reasoning tags";
    return `${include}; ${exclude}; ${controls}`;
}

function buildRegexPreviewText(regexSettings, contextData) {
    const recent = (contextData.recentChatRawText || collectRecentChatRawText(contextData.context))
        .find((line) => {
            const value = String(line || "");
            return value.includes(regexSettings.contentStartTag || "<content>") || value.includes("@bubble:");
        });
    if (recent) return recent.slice(0, 2000);
    return `${DEFAULT_REGEX_SETTINGS.previewText}\n\n@bubble:王福生|平静|这句只朗读正文部分。`;
}

function escapeRegexLiteral(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRegexPreview(regexSettings) {
    try {
        return prepareTtsReadableText(String(regexSettings.previewText || ""), regexSettings, { stripBubbleTags: true }) || "没有可朗读正文。";
    } catch (error) {
        return `预览失败：${error?.message || error}`;
    }
}

function prepareTtsText(text, settings = getSettings()) {
    return prepareTtsReadableText(String(text || ""), settings.regex, { stripBubbleTags: true });
}

function applyTtsBoundaryFilter(text, regexSettings = getSettings().regex) {
    let result = applyTtsBlacklistFilter(String(text || ""), regexSettings);
    const contentStart = String(regexSettings.contentStartTag || "").trim();
    const contentEnd = String(regexSettings.contentEndTag || "").trim();
    const contentPair = findFirstTagPair(result, [
        [contentStart, contentEnd],
        ["<content>", "</content>"],
        ["<正文>", "</正文>"],
        ["<body>", "</body>"],
        ["<message>", "</message>"],
        ["[content]", "[/content]"],
    ].filter(([start, end]) => start && end));

    if (contentPair && (regexSettings.contentOnlyEnabled || result.includes(contentPair[0]))) {
        result = extractBetweenLiteralTags(result, contentPair[0], contentPair[1]).join("\n\n");
    } else if (regexSettings.contentOnlyEnabled && contentStart && result.includes(contentStart)) {
        result = extractAfterUnclosedLiteralTag(result, contentStart, contentEnd);
    }
    return applyTtsSupplementalCleanup(result);
}

function prepareTtsReadableText(text, regexSettings = getSettings().regex, options = {}) {
    return stripHtml(stripTtsControlMarkup(applyTtsBoundaryFilter(String(text || ""), regexSettings), {
        ...regexSettings,
        stripBubbleTags: options.stripBubbleTags !== false,
    }))
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function applyTtsBlacklistFilter(text, regexSettings = getSettings().regex) {
    let result = String(text || "");
    result = result.replace(/```[\s\S]*?```/g, "\n");
    result = result.replace(/~~~[\s\S]*?~~~/g, "\n");

    const configuredExclude = [
        String(regexSettings.excludeStartTag || "").trim(),
        String(regexSettings.excludeEndTag || "").trim(),
    ];
    const blacklistPairs = [
        configuredExclude,
        ["<think>", "</think>"],
        ["<thinking>", "</thinking>"],
        ["<reasoning>", "</reasoning>"],
        ["<analysis>", "</analysis>"],
        ["<metacognition>", "</metacognition>"],
        ["<image>", "</image>"],
        ["<图片>", "</图片>"],
        ["<img>", "</img>"],
        ["<prompt>", "</prompt>"],
        ["<negative>", "</negative>"],
        ["<time>", "</time>"],
        ["[image]", "[/image]"],
        ["[图片]", "[/图片]"],
        ["[img]", "[/img]"],
        ["[thinking]", "[/thinking]"],
        ["[reasoning]", "[/reasoning]"],
        ["[analysis]", "[/analysis]"],
        ["[metacognition]", "[/metacognition]"],
    ]
        .filter(([start, end]) => start && end)
        .filter(([start, end], index, pairs) => pairs.findIndex(([s, e]) => s === start && e === end) === index);

    for (const [startTag, endTag] of blacklistPairs) {
        result = removeBetweenLiteralTags(result, startTag, endTag, { removeUnclosedToNextContent: true });
    }

    result = result.replace(/<(?:think|thinking|reasoning|analysis|metacognition)\b[\s\S]*?<\/(?:think|thinking|reasoning|analysis|metacognition)>/giu, "\n");
    result = result.replace(/<time\b[\s\S]*?<\/time>/giu, "\n");
    result = result.replace(/<img\b[^>]*>/giu, " ");
    result = result.replace(/\[(?:metacognition|analysis|thinking|reasoning)\][\s\S]*?(?=\n\s*(?:<content>|@bubble:|[\u3400-\u9fff]{2,}))/giu, "\n");
    return truncateAtGeneratedRuleTail(result);
}

function applyTtsSupplementalCleanup(text) {
    return truncateAtGeneratedRuleTail(String(text || ""))
        .replace(/\n{3,}/g, "\n\n");
}

function stripTtsControlMarkup(text, regexSettings = getSettings().regex) {
    let result = String(text || "");
    result = result.replace(/```[\s\S]*?```/g, "\n");
    result = result.replace(/~~~[\s\S]*?~~~/g, "\n");
    if (regexSettings.stripBubbleTags !== false) {
        result = result.replace(/(^|\n)\s*@bubble:[^\n|]*\|[^\n|]*\|\s*/giu, "$1");
        result = result.replace(/\s*@bubble:[^\n|]*\|[^\n|]*\|\s*/giu, " ");
    }
    result = result.replace(/(^|\n)\s*@bubble(?::[^\n]*)?$/giu, "$1");
    result = result.replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/giu, "\n");
    result = result.replace(/<reasoning[\s\S]*?<\/reasoning>/giu, "\n");
    result = result.replace(/\[(?:image|图片|img)\][\s\S]*?\[\/(?:image|图片|img)\]/giu, "\n");
    result = result.replace(/<img\b[^>]*>/giu, " ");
    return result.replace(/\n{3,}/g, "\n\n");
}

function extractBetweenLiteralTags(text, startTag, endTag) {
    const source = String(text || "");
    const parts = [];
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf(startTag, cursor);
        if (start < 0) break;
        const bodyStart = start + startTag.length;
        const end = source.indexOf(endTag, bodyStart);
        if (end < 0) break;
        parts.push(source.slice(bodyStart, end));
        cursor = end + endTag.length;
    }
    return parts;
}

function extractAfterUnclosedLiteralTag(text, startTag, endTag = "") {
    const source = String(text || "");
    const start = source.indexOf(startTag);
    if (start < 0) return source;
    const bodyStart = start + startTag.length;
    if (endTag) {
            const end = source.indexOf(endTag, bodyStart);
            if (end >= 0) return source.slice(bodyStart, end);
        }
    return truncateAtGeneratedRuleTail(source.slice(bodyStart));
}

function removeBetweenLiteralTags(text, startTag, endTag, options = {}) {
    const source = String(text || "");
    let result = "";
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf(startTag, cursor);
        if (start < 0) {
            result += source.slice(cursor);
            break;
        }
        result += source.slice(cursor, start);
        const end = source.indexOf(endTag, start + startTag.length);
        if (end < 0) {
            const nextContent = options.removeUnclosedToNextContent
                ? findNextWhitelistStart(source, start + startTag.length)
                : -1;
            if (nextContent >= 0) {
                cursor = nextContent;
                continue;
            }
            break;
        }
        cursor = end + endTag.length;
    }
    return result;
}

function findNextWhitelistStart(text, fromIndex = 0) {
    const source = String(text || "");
    const tags = ["<content>", "<正文>", "<body>", "<message>", "[content]"];
    const indexes = tags
        .map((tag) => source.indexOf(tag, fromIndex))
        .filter((index) => index >= 0);
    return indexes.length ? Math.min(...indexes) : -1;
}

function truncateAtGeneratedRuleTail(text) {
    const source = String(text || "");
    const patterns = [
        /\n\s*<(?:think|thinking|reasoning|analysis|metacognition|prompt|system|instructions?)\b/iu,
        /\n\s*\[(?:metacognition|analysis|thinking|reasoning|system|prompt)\]/iu,
        /\n\s*-\s*(?:确认输出语言|第二人称视角|只写你能看到|当前时间|分析本轮用户输入|世界书设定核验|叙事语音|角色知识|文风|character_engine|Mingyue输入|上一条无内容|结尾不能|echo与control|wardrobe_physics|动作多样性|构思草稿|禁词检查|结尾检查|世界时空栏)/u,
    ];
    const indexes = patterns
        .map((pattern) => source.search(pattern))
        .filter((index) => index >= 0);
    if (!indexes.length) return source;
    return source.slice(0, Math.min(...indexes));
}

function hasGeneratedRuleMarkers(text) {
    return /(?:\[metacognition\]|\[analysis\]|\[thinking\]|character_engine|Mingyue输入|世界书设定核验|禁词检查|构思草稿|只写你能看到|第二人称视角|确认输出语言|Voice Design Prompt|性别与年龄：|音色\/质感：|角色\/人设：|朗读指导：只朗读)/u
        .test(String(text || ""));
}

function getRegexSnapshotHtml() {
    const groups = [
        ["Global", getScriptsByType(SCRIPT_TYPES.GLOBAL)],
        ["Scoped", getScriptsByType(SCRIPT_TYPES.SCOPED)],
        ["Preset", getScriptsByType(SCRIPT_TYPES.PRESET)],
    ];
    const rows = groups.flatMap(([type, scripts]) => scripts.map((script) => ({ type, script })));
    if (!rows.length) return renderEmpty("当前没有 ST 正则脚本");
    return `
<div class="st-mimo-regex-table">
    ${rows.map(({ type, script }) => `
        <div class="st-mimo-regex-row ${script.scriptName?.startsWith(MIMO_REGEX_PREFIX) ? "mimo" : ""}">
            <span>${escapeHtml(type)}</span>
            <strong>${escapeHtml(script.scriptName || "未命名")}</strong>
            <code>${escapeHtml(script.findRegex || "")}</code>
            <em>${script.disabled ? "禁用" : "启用"}</em>
        </div>`).join("")}
</div>`;
}

function exportAll() {
    const settings = getSettings();
    const payload = {
        schema: "st-mimo-tts/full-export/v1",
        extension: EXTENSION_NAME,
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        settings: cloneData(settings),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `st-mimo-tts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function importAll(file) {
    if (!file) return;
    try {
        const json = JSON.parse(await file.text());
        const importedSettings = json.settings || json;
        if (!isPlainObject(importedSettings)) throw new Error("导入文件格式不正确。");
        extension_settings[EXTENSION_NAME] = mergeDefaults(importedSettings, DEFAULT_SETTINGS);
        const settings = getSettings();
        appState.selectedNarrators.clear();
        appState.selectedRoles.clear();
        appState.editingNarratorId = settings.libraries.narrators[0]?.uid || "";
        appState.editingGroupId = settings.libraries.roleGroups[0]?.uid || "";
        appState.editingRoleId = getGroup(settings, appState.editingGroupId)?.roles?.[0]?.uid || "";
        saveSettings({ render: true });
        notify("info", "MiMo TTS 配置已导入。");
    } catch (error) {
        notify("error", error?.message || String(error));
    }
}

function buildStyleControlInstruction(config) {
    const role = String(config.styleRole || config.director || "").trim();
    const scene = String(config.styleScene || "").trim();
    const guidance = String(config.styleGuidance || config.deliveryInstruction || "").trim();
    const sections = [
        role && `【角色】\n${role}`,
        scene && `【场景】\n${scene}`,
        guidance && `【指导】\n${guidance}`,
    ].filter(Boolean);
    if (!sections.length) return "";
    return `风格控制（合成控制，不是朗读正文；不要读出字段名或说明文字）：\n${sections.join("\n\n")}`;
}

function buildUserContent(config) {
    const model = normalizeMimoModel(config.model);
    const speedInstruction = buildTtsSpeedInstruction(config.ttsSpeedRate);
    const styleControl = buildStyleControlInstruction(config);
    if (model === MIMO_MODELS.VOICE_DESIGN) {
        const design = String(config.voiceDesignPrompt || "").trim();
        if (!design) throw new Error("Voice Design Prompt 不能为空。");
        return [`音色描述 Voice Design Prompt：\n${design}`, styleControl, speedInstruction].filter(Boolean).join("\n\n");
    }
    return [styleControl, speedInstruction].filter(Boolean).join("\n\n");
}

function applyStylePrefix(text, config) {
    const rawText = String(text || "").trim();
    return stripLeadingStyleCueText(rawText);
}

function buildRequestPayload(text, config) {
    const assistantContent = applyStylePrefix(text, config);
    if (!assistantContent) throw new Error("朗读文本不能为空。");

    const model = normalizeMimoModel(config.model);
    const userContent = buildUserContent(config);
    const messages = [];
    if (userContent) messages.push({ role: "user", content: userContent });
    messages.push({ role: "assistant", content: assistantContent });

    const audio = { format: config.format || "wav" };
    if (model === MIMO_MODELS.PRESET) {
        audio.voice = config.presetVoice || "mimo_default";
    } else if (model === MIMO_MODELS.VOICE_CLONE) {
        const cloneAudio = String(config.voiceCloneAudioData || "").trim();
        if (!cloneAudio) throw new Error("voiceclone 模型需要先上传参考音频。");
        audio.voice = cloneAudio;
    } else if (config.optimizeTextPreview === true) {
        audio.optimize_text_preview = true;
    }

    return {
        model,
        messages,
        audio,
    };
}

async function requestMimoAudio(text, signal, profileOverride = null) {
    const settings = getSettings();
    const active = profileOverride ? { profile: profileOverride } : getActiveProfile(settings);
    const config = getProfileConfig(active?.profile, settings);
    const payload = buildRequestPayload(text, config);
    const apiKey = pickApiKey(settings);
    const endpoint = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal,
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`MiMo API ${response.status}: ${responseText.slice(0, 500)}`);

    let json;
    try {
        json = JSON.parse(responseText);
    } catch {
        throw new Error("MiMo API 返回的不是 JSON。");
    }

    const audio = json?.choices?.[0]?.message?.audio;
    const data = audio?.data;
    if (!data) throw new Error("MiMo API 返回中没有 audio.data。");

    const bytes = base64ToBytes(data);
    const format = String(audio?.format || payload.audio.format || "wav").toLowerCase();
    if (format === "pcm16") {
        return new Blob([buildWavHeader(bytes.byteLength, 24000), bytes], { type: "audio/wav" });
    }
    return new Blob([bytes], { type: format === "mp3" ? "audio/mpeg" : "audio/wav" });
}

function getAudioExtension(blob, settings = getSettings()) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    const format = String(settings.format || "wav").replace(/^\./, "").toLowerCase();
    return ["wav", "mp3", "ogg", "m4a"].includes(format) ? format : "wav";
}

function makeAudioFileName(extension, metadata = {}) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
    const message = Number.isFinite(Number(metadata.sourceMessageId)) ? `m${Number(metadata.sourceMessageId)}` : "manual";
    const segment = Number(metadata.segmentIndex || 0);
    const total = Number(metadata.totalSegments || 0);
    const suffix = total > 1 ? `-s${String(segment).padStart(2, "0")}of${String(total).padStart(2, "0")}` : "";
    return `mimo-${stamp}-${message}${suffix}.${extension}`;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error("音频读取失败。"));
        reader.onloadend = () => {
            const result = String(reader.result || "");
            resolve(result.includes(",") ? result.split(",").pop() : result);
        };
        reader.readAsDataURL(blob);
    });
}

function recordLastTtsText(text, metadata = {}) {
    const settings = getSettings();
    settings.generatedAudio.lastText = String(text || "").trim();
    settings.generatedAudio.lastSavedAt = new Date().toISOString();
    settings.generatedAudio.lastFileName = metadata.fileName || settings.generatedAudio.lastFileName || "";
    settings.generatedAudio.lastAudioUrl = metadata.audioUrl || settings.generatedAudio.lastAudioUrl || "";
    settings.generatedAudio.lastTextUrl = metadata.textUrl || settings.generatedAudio.lastTextUrl || "";
    settings.generatedAudio.lastDirectoryPath = metadata.directoryPath || settings.generatedAudio.lastDirectoryPath || "";
    saveSettings();
}

async function saveGeneratedAudio(blob, text, metadata = {}) {
    const settings = getSettings();
    recordLastTtsText(text, metadata);
    if (!settings.generatedAudio.saveAudio) return null;

    const extension = getAudioExtension(blob, settings);
    const payload = {
        fileName: makeAudioFileName(extension, metadata),
        format: extension,
        data: await blobToBase64(blob),
        text: String(text || ""),
        segmentIndex: metadata.segmentIndex || 0,
        totalSegments: metadata.totalSegments || 0,
        sourceMessageId: metadata.sourceMessageId ?? null,
    };

    const response = await fetch(`${PLUGIN_API_ROOT}/save`, {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`保存语音失败：${message || response.status}`);
    }

    const result = await response.json();
    recordLastTtsText(text, result);
    return result;
}

async function saveGeneratedAudioQuietly(blob, text, metadata = {}) {
    try {
        const result = await saveGeneratedAudio(blob, text, metadata);
        if (result?.fileName) setStatus(`已保存语音：${result.fileName}`, "ok");
        return result;
    } catch (error) {
        console.warn("[MiMo TTS] Failed to save generated audio", error);
        notify("warning", `${error?.message || error}。重启 SillyTavern 后会启用语音文件夹插件。`);
        return null;
    }
}

async function openGeneratedAudioFolder() {
    try {
        const response = await fetch(`${PLUGIN_API_ROOT}/open-folder`, {
            method: "POST",
            headers: getRequestHeaders(),
            body: "{}",
        });
        if (!response.ok) throw new Error(await response.text() || String(response.status));
        const result = await response.json();
        const settings = getSettings();
        settings.generatedAudio.lastDirectoryPath = result.directoryPath || settings.generatedAudio.lastDirectoryPath || "";
        saveSettings({ render: true });
        notify("info", `已打开语音文件夹：${result.directoryPath || GENERATED_AUDIO_PUBLIC_DIR}`);
    } catch (error) {
        const settings = getSettings();
        if (settings.generatedAudio.lastAudioUrl) {
            window.open(settings.generatedAudio.lastAudioUrl, "_blank", "noopener");
            notify("warning", "语音文件夹插件尚未可用，已打开最近音频。请重启 SillyTavern 后再点文件夹。");
            return;
        }
        window.open(GENERATED_AUDIO_PUBLIC_DIR, "_blank", "noopener");
        notify("warning", `语音文件夹插件尚未可用：${error?.message || error}。请重启 SillyTavern。`);
    }
}

function base64ToBytes(value) {
    const base64 = String(value).includes(",") ? String(value).split(",").pop() : String(value);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function buildWavHeader(dataLength, sampleRate) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataLength, true);
    return header;
}

function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function splitTtsSegments(text, maxChars = PLAYER_SEGMENT_MAX_CHARS) {
    const source = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!source) return [];

    const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const segments = [];
    for (const paragraph of paragraphs.length ? paragraphs : [source]) {
        segments.push(...splitLongParagraph(paragraph, maxChars));
    }
    return segments.map((part) => part.trim()).filter(Boolean);
}

function splitLongParagraph(paragraph, maxChars) {
    const source = String(paragraph || "").trim();
    if (source.length <= maxChars) return [source];

    const sentences = source.match(/[^。！？!?；;\n]+[。！？!?；;]*/gu) || [source];
    const segments = [];
    let buffer = "";

    const flush = () => {
        const trimmed = buffer.trim();
        if (trimmed) segments.push(trimmed);
        buffer = "";
    };

    for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
        if (sentence.length > maxChars) {
            flush();
            for (let i = 0; i < sentence.length; i += maxChars) {
                segments.push(sentence.slice(i, i + maxChars).trim());
            }
            continue;
        }

        if (buffer && (buffer.length + sentence.length + 1) > maxChars) flush();
        buffer = buffer ? `${buffer}${sentence}` : sentence;
    }
    flush();
    return segments;
}

function getPlaybackSegmentText(segment) {
    return typeof segment === "string" ? segment : String(segment?.text || "");
}

function getPlaybackSegmentRawText(segment) {
    return typeof segment === "string" ? segment : String(segment?.rawText || segment?.text || "");
}

function getPlaybackSegmentProfile(segment, fallbackProfile) {
    return isPlainObject(segment) && segment.profile ? segment.profile : fallbackProfile;
}

function getPlaybackSegmentSpeaker(segment) {
    return typeof segment === "string" ? "旁白" : (segment?.speakerName || "旁白");
}

function getCurrentPlaybackSpeaker() {
    return getPlaybackSegmentSpeaker(playbackState.segments[playbackState.currentIndex]);
}

function normalizePlaybackFingerprintText(text) {
    return String(text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hashPlaybackText(text) {
    const source = normalizePlaybackFingerprintText(text);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function buildPlaybackRequestKey(text, sourceMessageId = null) {
    const normalized = normalizePlaybackFingerprintText(text);
    if (!normalized) return "";
    const messagePart = Number.isFinite(Number(sourceMessageId)) ? `m${Number(sourceMessageId)}` : "manual";
    return `${messagePart}:${normalized.length}:${hashPlaybackText(normalized)}`;
}

function shouldSkipDuplicatePlayback(requestKey, options = {}) {
    if (!requestKey || options.force) return false;
    const now = Date.now();
    const isActiveSame = playbackState.activeRequestKey === requestKey && playbackState.mode !== "idle";
    if (isActiveSame) return true;
    const sourceMessageId = Number.isFinite(Number(options.sourceMessageId)) ? Number(options.sourceMessageId) : null;
    if (options.auto
        && sourceMessageId !== null
        && playbackState.lastAutoReadMessageId === sourceMessageId
        && (now - Number(playbackState.lastAutoReadMessageAt || 0)) < AUTO_DUPLICATE_PLAYBACK_WINDOW_MS) {
        return true;
    }
    if (!options.auto) return false;
    if (options.auto
        && playbackState.lastAutoReadKey === requestKey
        && (now - Number(playbackState.lastAutoReadAt || 0)) < AUTO_DUPLICATE_PLAYBACK_WINDOW_MS) {
        return true;
    }
    return playbackState.lastRequestKey === requestKey
        && (now - Number(playbackState.lastRequestAt || 0)) < DUPLICATE_PLAYBACK_WINDOW_MS;
}

function prepareTtsPlaybackSource(text, settings = getSettings()) {
    return prepareTtsReadableText(String(text || ""), settings.regex, { stripBubbleTags: false });
}

function cleanPlaybackUnitText(text, settings = getSettings()) {
    return stripLeadingStyleCueText(prepareTtsReadableText(String(text || ""), settings.regex, { stripBubbleTags: true }));
}

function stripKnownNonStoryBlocks(text) {
    return applyTtsBlacklistFilter(String(text || ""), getSettings().regex);
}

function normalizeAudioEmotion(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    const aliases = [
        [/^(平静|冷静|淡定)$/u, "平静"],
        [/^(开心|高兴|快乐|愉快|笑)$/u, "开心"],
        [/^(悲伤|伤心|难过)$/u, "悲伤"],
        [/^(生气|愤怒|恼火)$/u, "愤怒"],
        [/^(紧张|忐忑)$/u, "紧张"],
        [/^(害怕|恐惧|怕)$/u, "害怕"],
        [/^(惊讶|震惊|惊喜)$/u, "惊讶"],
        [/^(兴奋|激动)$/u, "兴奋"],
        [/^(疲惫|累|困|有气无力)$/u, "疲惫"],
        [/^(感激|感谢|感动|欣慰)$/u, "感激"],
        [/^(委屈|撒娇|心虚|无奈|释然|冷漠|温柔|高冷|慵懒|俏皮|认真|严肃|疑惑)$/u, source],
    ];
    for (const [pattern, tag] of aliases) {
        if (pattern.test(source)) return tag;
    }
    return source.length <= 8 ? source : "";
}

function inferAudioStyleTags(text, profileType) {
    const source = String(text || "");
    const tags = [];
    if (/[?？]$/.test(source.trim())) tags.push("疑惑");
    if (/[!！]{1,}$/.test(source.trim())) tags.push("惊讶");
    if (/哈|哈哈|笑|噗|乐了/u.test(source)) tags.push("开心");
    if (/谢谢|多谢|感激|破费|麻烦你/u.test(source)) tags.push("感激");
    if (/唉|叹|无奈|算了/u.test(source)) tags.push("无奈");
    if (/累|困|疲惫|有气无力/u.test(source)) tags.push("疲惫");
    if (/紧张|慌|怕|害怕|糟了/u.test(source)) tags.push("紧张");
    if (/哭|泪|哽咽|委屈/u.test(source)) tags.push("委屈");
    return uniqueNames(tags).filter((tag) => DYNAMIC_STYLE_TAGS.has(tag));
}

function inferInlineAudioTags(text, emotion) {
    const source = String(text || "");
    const tags = [];
    if (/哈|哈哈|噗|笑/u.test(source) || emotion === "开心") tags.push("轻笑");
    if (/唉|叹|无奈/u.test(source) || emotion === "无奈") tags.push("叹气");
    if (/深呼吸|冷静/u.test(source) || emotion === "紧张") tags.push("深呼吸");
    if (/哽咽|哭|眼泪/u.test(source)) tags.push("哽咽");
    if (/累|困|疲惫/u.test(source) || emotion === "疲惫") tags.push("小声");
    return uniqueNames(tags).slice(0, 2);
}

function applyAudioControlTags(text, emotion, profileType, settings = getSettings()) {
    const source = stripLeadingStyleCueText(String(text || "").trim());
    if (!source || settings.audioTagControlEnabled === false) return source;

    const normalizedEmotion = normalizeAudioEmotion(emotion);
    const styleTags = uniqueNames([normalizedEmotion, ...inferAudioStyleTags(source, profileType)])
        .filter((tag) => DYNAMIC_STYLE_TAGS.has(tag))
        .slice(0, 2);
    const stylePrefix = styleTags.map((tag) => `(${tag})`).join("");
    const inlineTags = inferInlineAudioTags(source, normalizedEmotion);
    const inlinePrefix = inlineTags.map((tag) => `[${tag}]`).join("");
    return `${stylePrefix}${inlinePrefix}${source}`;
}

async function refreshPlaybackRoleGroup(settings, rawText) {
    try {
        const contextData = await collectCurrentContextData();
        const extraText = stripHtml(String(rawText || ""));
        if (extraText) {
            contextData.sourceText = [contextData.sourceText, extraText].filter(Boolean).join("\n\n");
            contextData.roleNames = uniqueNames([
                ...contextData.roleNames,
                ...collectPersistentExplicitSpeakerNamesFromText(rawText),
                ...collectPersistentBracketRoleNamesFromText(rawText),
                ...getReferencedCharacterCardNames(contextData.sourceText, contextData.currentCharacter?.name),
            ].map(resolvePreferredRoleName)).filter(isRoleName);
        }
        const result = upsertRoleGroupFromContext(settings, contextData);
        settings.syncSkill.lastSyncAt = new Date().toISOString();
        settings.syncSkill.lastCharacterName = contextData.currentCharacter?.name || "";
        settings.syncSkill.lastWorldNames = contextData.worldNames;
        settings.syncSkill.lastRoleCount = result.roleCount;
        settings.syncSkill.lastSummary = `角色组库：${result.group.name}，${result.roleCount} 个角色；播放时按旁白/角色分段。`;
        saveSettingsDebounced();
        return result.group;
    } catch (error) {
        console.warn("[MiMo TTS] Failed to refresh role group before playback", error);
        return getPreferredRoleGroup(settings);
    }
}

function buildPlaybackSegments(text, settings, roleGroup) {
    const source = prepareTtsPlaybackSource(text, settings);
    if (!source) return [];
    if (hasGeneratedRuleMarkers(source)) {
        console.warn("[MiMo TTS] Blocked suspicious TTS source that still contains prompt/rule markers.");
        notify("warning", "检测到这条内容仍包含思维链或规则文本，已停止朗读，避免把后台规则发给 MiMo。");
        return [];
    }

    const narrator = ensureFixedNarrator(settings);
    const roleLookup = buildRoleLookup(roleGroup);
    const units = splitSpeechUnits(source, roleLookup);
    const segments = [];

    for (const unit of units) {
        const cleanText = cleanPlaybackUnitText(unit.text, settings);
        if (!cleanText) continue;
        const profile = unit.profile || narrator;
        const profileType = unit.profile ? "role" : "narrator";
        const speakerName = unit.profile ? profile.name : "旁白";
        for (const part of splitTtsSegments(cleanText)) {
            const rawText = part.trim();
            segments.push({
                text: applyAudioControlTags(rawText, unit.emotion, profileType, settings),
                rawText,
                emotion: unit.emotion || "",
                profile,
                speakerName,
                profileType,
            });
        }
    }

    if (segments.length > PLAYER_SUSPICIOUS_SEGMENT_LIMIT && hasGeneratedRuleMarkers(source)) {
        console.warn("[MiMo TTS] Blocked suspicious oversized TTS segment list.", { count: segments.length });
        notify("warning", "检测到异常多段且疑似包含规则文本，已停止朗读。");
        return [];
    }

    return segments;
}

function buildRoleLookup(group) {
    const roles = Array.isArray(group?.roles) ? group.roles : [];
    const byKey = new Map();
    for (const role of roles) {
        for (const value of [role.name, role.displayId, role.sourceCharacter, ...(Array.isArray(role.aliases) ? role.aliases : [])]) {
            const key = roleNameKey(value);
            if (key && !byKey.has(key)) byKey.set(key, role);
        }
    }
    const names = roles
        .flatMap((role) => [role.name, role.sourceCharacter, role.displayId, ...(Array.isArray(role.aliases) ? role.aliases : [])])
        .map(cleanRoleName)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    return { byKey, names };
}

function findRoleProfileByName(name, roleLookup) {
    return roleLookup.byKey.get(roleNameKey(name)) || null;
}

function splitSpeechUnits(source, roleLookup) {
    const units = [];
    let cursor = 0;
    const bubbleRegex = /@bubble:([^|\n]{1,28})\|([^|\n]{0,20})\|\s*/giu;
    let match;

    while ((match = bubbleRegex.exec(source))) {
        pushSpeechChunk(units, source.slice(cursor, match.index), null, roleLookup, "");
        const speakerName = cleanRoleName(match[1]);
        const emotion = normalizeAudioEmotion(match[2]);
        const profile = findRoleProfileByName(speakerName, roleLookup) || createTransientSpeakerProfile(speakerName, emotion);
        const bubble = extractBubbleDialogue(source, bubbleRegex.lastIndex);
        pushSpeechUnit(units, bubble.text, profile, emotion);
        cursor = bubble.endIndex;
        bubbleRegex.lastIndex = cursor;
    }
    pushSpeechChunk(units, source.slice(cursor), null, roleLookup, "");

    return units;
}

function extractBubbleDialogue(source, startIndex) {
    const text = String(source || "");
    let index = startIndex;
    while (index < text.length && /[ \t\r\n]/u.test(text[index])) index += 1;

    const open = text[index];
    const closePairs = {
        "[": "]",
        "【": "】",
        "「": "」",
        "『": "』",
        "(": ")",
        "（": "）",
    };
    const close = closePairs[open];
    if (close) {
        const end = text.indexOf(close, index + 1);
        if (end >= 0) {
            return {
                text: text.slice(index + 1, end).trim(),
                endIndex: end + close.length,
            };
        }
        const lineEnd = findNextLineOrBubbleStart(text, index + 1);
        return {
            text: text.slice(index + 1, lineEnd).trim(),
            endIndex: lineEnd,
        };
    }

    const lineEnd = findNextLineOrBubbleStart(text, index);
    return {
        text: text.slice(index, lineEnd).trim(),
        endIndex: lineEnd,
    };
}

function findNextLineOrBubbleStart(text, startIndex) {
    const lineEnd = text.indexOf("\n", startIndex);
    const bubbleStart = text.slice(startIndex).search(/@bubble:/iu);
    const bubbleIndex = bubbleStart >= 0 ? startIndex + bubbleStart : -1;
    const indexes = [lineEnd, bubbleIndex].filter((index) => index >= 0);
    return indexes.length ? Math.min(...indexes) : text.length;
}

function createTransientSpeakerProfile(name, emotion = "") {
    const speakerName = cleanRoleName(name) || "临时配角";
    const style = pickTransientSpeakerStyle(speakerName);
    return createProfile("role", {
        uid: `tmp-role-${hashPlaybackText(speakerName)}`,
        displayId: `TEMP-${sanitizeId(speakerName)}`,
        name: speakerName,
        sourceCharacter: speakerName,
        director: `播放时临时说话人：${speakerName}。不写入固定角色组库。`,
        model: MIMO_MODELS.VOICE_DESIGN,
        presetVoice: "mimo_default",
        format: "wav",
        stylePrefix: "",
        styleRole: `${speakerName}，当前段落里的临时说话人。${style.texture}`,
        styleScene: "在当前 SillyTavern 正文场景里说一句或少量台词，然后声音交还给旁白或固定角色。",
        styleGuidance: `只朗读 ${speakerName} 的这一句台词正文。不要读角色名、@bubble、括号、情绪标签或旁白。${emotion ? `当前情绪：${emotion}。` : "按台词自然判断情绪。"}保持临时配角声线，与固定旁白区分，但不要抢戏。`,
        deliveryInstruction: `只朗读 ${speakerName} 的这一句台词正文。不要读角色名、@bubble、括号、情绪标签或旁白。保持临时配角声线，与固定旁白区分，但不要抢戏。`,
        voiceDesignPrompt: buildTransientSpeakerVoicePrompt(speakerName, style, emotion),
        notes: "MiMo 播放时临时生成，不属于角色组库。",
        syncGenerated: false,
        syncSource: "mimo-transient-playback",
    });
}

function pickTransientSpeakerStyle(name) {
    const styles = [
        {
            tags: ["年轻女性", "自然", "轻快", "清亮"],
            texture: "清亮自然的年轻女性声线，口语感强，和旁白区分但不夸张。",
            pace: "中速偏快，短句轻巧，长句按语义停顿。",
        },
        {
            tags: ["年轻女性", "专业", "干练", "清晰"],
            texture: "干练清晰的年轻女性声线，礼貌、利落，有一点职业感但不要播音腔。",
            pace: "中速，句尾干净，说明类台词重点明确。",
        },
        {
            tags: ["年轻女性", "温和", "生活化", "柔软"],
            texture: "温和柔软的年轻女性声线，像熟人自然说话，不要老气。",
            pace: "中速偏慢一点，气息轻，停顿自然。",
        },
    ];
    const hash = parseInt(hashPlaybackText(name), 36) || 0;
    return styles[Math.abs(hash) % styles.length];
}

function buildTransientSpeakerVoicePrompt(name, style, emotion = "") {
    const emotionText = emotion ? `当前情绪/语气：${emotion}。` : "当前情绪/语气：根据台词自然判断，不要夸张。";
    return `性别与年龄：临时配角，默认年轻女性或年轻自然声；不要老太太声、成熟厚嗓、播音腔或新闻腔。
音色/质感：${style.texture}
情绪/语气：${emotionText}
语速/节奏：${style.pace}

角色/人设：${name}，当前段落里的临时说话人，不属于固定角色组库。
说话风格：贴合台词身份和场景，生活化、自然、有区分度。
场景描写：在当前 SillyTavern 正文场景里说一句或少量台词，然后声音应交还给旁白或固定角色。
年代参照：遵循当前剧情年代，不额外加入译制片腔、新闻腔或夸张动漫腔。

角色：${name}。临时配角，声音只服务当前台词。

场景：与旁白和固定角色交替出现，台词结束后不延续到旁白。

指导：
- 只读台词本身，不读说话人姓名、情绪标签和括号。
- 声线年轻、自然、清晰，与旁白明显区分。
- 表演克制，不要把后续旁白也当成这个角色。`;
}

function pushSpeechChunk(units, chunk, defaultRole, roleLookup, defaultEmotion = "") {
    const source = String(chunk || "").replace(/\r\n/g, "\n");
    if (!source.trim()) return;

    const paragraphs = source.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
        const lines = paragraph.split(/\n/);
        pushSpeechLines(units, lines, defaultRole, roleLookup, defaultEmotion);
    }
}

function pushSpeechLines(units, lines, defaultRole, roleLookup, defaultEmotion = "") {
    let buffer = "";
    let index = 0;
    const flushBuffer = () => {
        pushSpeechUnit(units, buffer, defaultRole, defaultEmotion);
        buffer = "";
    };

    while (index < lines.length) {
        const vertical = matchVerticalSpeakerBlock(lines, index, roleLookup);
        if (vertical) {
            flushBuffer();
            const dialogue = takeVerticalSpeakerDialogue(lines, vertical.nextIndex);
            pushSpeechUnit(units, dialogue.text, vertical.profile, vertical.emotion || "");
            index = dialogue.nextIndex;
            continue;
        }

        const line = lines[index];
        const prefixed = matchKnownSpeakerPrefix(line, roleLookup);
        if (prefixed) {
            flushBuffer();
            pushSpeechUnit(units, prefixed.text, prefixed.profile, prefixed.emotion || "");
            index += 1;
            continue;
        }
        buffer = buffer ? `${buffer}\n${line}` : line;
        index += 1;
    }

    flushBuffer();
}

function matchVerticalSpeakerBlock(lines, startIndex, roleLookup) {
    const chars = [];
    for (let index = startIndex; index < Math.min(lines.length, startIndex + 6); index += 1) {
        const value = String(lines[index] || "").trim();
        if (!/^[\u3400-\u9fff]$/u.test(value)) break;
        chars.push(value);
    }
    if (chars.length < 2) return null;

    for (let count = chars.length; count >= 2; count -= 1) {
        const candidates = [];
        if (count >= 3 && chars[0] === chars[1]) {
            candidates.push({ name: chars.slice(1, count).join(""), duplicatedHeading: true });
        }
        candidates.push({ name: chars.slice(0, count).join(""), duplicatedHeading: false });

        for (const candidate of candidates) {
            const speakerName = cleanRoleName(candidate.name);
            if (!speakerName || speakerName.length < 2 || speakerName.length > 6) continue;
            const emotionLine = String(lines[startIndex + count] || "").trim();
            if (!isLikelySpeakerEmotionLine(emotionLine) || !String(lines[startIndex + count + 1] || "").trim()) continue;
            const profile = findRoleProfileByName(speakerName, roleLookup);
            if (!profile && !candidate.duplicatedHeading) continue;
            return {
                profile: profile || createTransientSpeakerProfile(speakerName, emotionLine),
                emotion: normalizeAudioEmotion(emotionLine),
                nextIndex: startIndex + count + 1,
            };
        }
    }

    return null;
}

function isLikelySpeakerEmotionLine(value) {
    const source = String(value || "").trim();
    if (!source || source.length > 8) return false;
    if (/[。！？!?，,；;：“”"'《》<>\[\]{}]/u.test(source)) return false;
    return /^[\p{Script=Han}A-Za-z]+$/u.test(source);
}

function takeVerticalSpeakerDialogue(lines, startIndex) {
    const dialogueLines = [];
    let index = startIndex;
    while (index < lines.length) {
        if (dialogueLines.length && matchVerticalSpeakerBlock(lines, index, { byKey: new Map(), names: [] })) break;
        const line = String(lines[index] || "");
        dialogueLines.push(line);
        index += 1;
        if (/[”"』」]\s*$/u.test(line.trim())) break;
    }
    return {
        text: dialogueLines.join("\n").trim(),
        nextIndex: index,
    };
}

function matchKnownSpeakerPrefix(line, roleLookup) {
    const source = String(line || "");
    const pipeDirect = source.match(/^\s*([^|｜\n]{1,28})\s*[|｜]([^|｜\n]{0,20})[|｜]\s*(.+)$/u);
    if (pipeDirect) {
        const profile = findRoleProfileByName(pipeDirect[1], roleLookup);
        if (profile) return { profile, emotion: normalizeAudioEmotion(pipeDirect[2]), text: pipeDirect[3] };
    }

    const direct = source.match(/^\s*([^:：|｜\]\n]{1,28})\s*[:：]\s*(.+)$/u)
        || source.match(/^\s*[【\[]([^】\]\n]{1,28})[】\]]\s*[:：]?\s*(.+)$/u);
    if (direct) {
        const profile = findRoleProfileByName(direct[1], roleLookup);
        if (profile) return { profile, emotion: "", text: direct[2] };
    }

    for (const name of roleLookup.names) {
        const escaped = escapeRegexLiteral(name);
        const patterns = [
            { regex: new RegExp(`^\\s*${escaped}\\s*[:：]\\s*(.+)$`, "u"), emotionIndex: 0, textIndex: 1 },
            { regex: new RegExp(`^\\s*${escaped}\\s*[|｜]([^|｜\\n]{0,20})[|｜]\\s*(.+)$`, "u"), emotionIndex: 1, textIndex: 2 },
            { regex: new RegExp(`^\\s*[【\\[]${escaped}[】\\]]\\s*[:：]?\\s*(.+)$`, "u"), emotionIndex: 0, textIndex: 1 },
        ];
        for (const pattern of patterns) {
            const match = source.match(pattern.regex);
            if (!match) continue;
            const profile = findRoleProfileByName(name, roleLookup);
            if (profile) return {
                profile,
                emotion: pattern.emotionIndex ? normalizeAudioEmotion(match[pattern.emotionIndex]) : "",
                text: match[pattern.textIndex],
            };
        }
    }
    return null;
}

function pushSpeechUnit(units, text, profile, emotion = "") {
    const cleanText = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
    if (!cleanText) return;
    const last = units[units.length - 1];
    const currentKey = profile?.uid || "narrator";
    const lastKey = last?.profile?.uid || "narrator";
    const currentEmotion = normalizeAudioEmotion(emotion);
    if (last && currentKey === lastKey && (last.emotion || "") === currentEmotion) {
        last.text = `${last.text}\n\n${cleanText}`;
        return;
    }
    units.push({ text: cleanText, profile: profile || null, emotion: currentEmotion });
}

function supportsReadingHighlight() {
    return Boolean(globalThis.CSS?.highlights && typeof globalThis.Highlight === "function");
}

function findMessageTextElementById(sourceMessageId) {
    const id = Number(sourceMessageId);
    if (!Number.isFinite(id)) return null;
    const messageElement = document.querySelector(`#chat .mes[mesid="${id}"]`);
    const textElement = messageElement?.querySelector(".mes_text");
    return textElement ? { messageElement, textElement } : null;
}

function shouldSkipHighlightTextNode(node) {
    const parent = node?.parentElement;
    if (!parent) return true;
    if (parent.closest("script, style, textarea, input, select, button, .mes_buttons, .st-mimo-message-button")) return true;
    if (parent.getAttribute("aria-hidden") === "true") return true;
    const style = getComputedStyle(parent);
    return style.display === "none" || style.visibility === "hidden";
}

function collectHighlightText(root) {
    const positions = [];
    const textParts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return shouldSkipHighlightTextNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
    });

    let node = walker.nextNode();
    while (node) {
        const value = node.nodeValue || "";
        for (let offset = 0; offset < value.length; offset += 1) {
            positions.push({ node, offset });
            textParts.push(value[offset]);
        }
        node = walker.nextNode();
    }

    return { text: textParts.join(""), positions };
}

function buildCompactSearchIndex(text) {
    const compact = [];
    const map = [];
    const source = String(text || "");
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (/\s/u.test(char)) continue;
        compact.push(char);
        map.push(index);
    }
    return { compact: compact.join(""), map };
}

function sequentialIndexes(start, length) {
    return Array.from({ length }, (_, index) => start + index);
}

function resolveSegmentHighlightIndexes(sourceText, segment, preferredStart = 0) {
    const source = String(sourceText || "");
    const target = String(segment || "").trim();
    if (!source || !target) return [];

    const safePreferredStart = Math.max(0, Math.min(Number(preferredStart) || 0, source.length));
    let exactStart = source.indexOf(target, safePreferredStart);
    if (exactStart < 0) exactStart = source.indexOf(target);
    if (exactStart >= 0) return sequentialIndexes(exactStart, target.length);

    const sourceIndex = buildCompactSearchIndex(source);
    const targetIndex = buildCompactSearchIndex(target);
    if (!sourceIndex.compact || !targetIndex.compact) return [];

    let compactStartHint = sourceIndex.map.findIndex((index) => index >= safePreferredStart);
    if (compactStartHint < 0) compactStartHint = 0;
    let compactStart = sourceIndex.compact.indexOf(targetIndex.compact, compactStartHint);
    if (compactStart < 0) compactStart = sourceIndex.compact.indexOf(targetIndex.compact);
    if (compactStart >= 0) {
        return sourceIndex.map.slice(compactStart, compactStart + targetIndex.compact.length);
    }

    const partialNeedle = targetIndex.compact.slice(0, Math.min(80, targetIndex.compact.length));
    if (partialNeedle.length < 8) return [];
    compactStart = sourceIndex.compact.indexOf(partialNeedle, compactStartHint);
    if (compactStart < 0) compactStart = sourceIndex.compact.indexOf(partialNeedle);
    if (compactStart < 0) return [];
    return sourceIndex.map.slice(compactStart, Math.min(sourceIndex.map.length, compactStart + targetIndex.compact.length));
}

function stopReadingHighlight() {
    if (readingHighlightState.rafId) {
        cancelAnimationFrame(readingHighlightState.rafId);
    }
    if (supportsReadingHighlight()) {
        CSS.highlights.delete(READING_HIGHLIGHT_NAME);
    }
    readingHighlightState.messageElement?.classList.remove("st-mimo-highlight-message");
    readingHighlightState.audio = null;
    readingHighlightState.messageElement = null;
    readingHighlightState.textElement = null;
    readingHighlightState.sourceText = "";
    readingHighlightState.charPositions = [];
    readingHighlightState.segmentIndexes = [];
    readingHighlightState.currentLocalIndex = -1;
    readingHighlightState.lastScrolledLocalIndex = -1;
    readingHighlightState.rafId = 0;
    readingHighlightState.token += 1;
}

function startReadingHighlight(audio, segment, options = {}) {
    stopReadingHighlight();
    if (!supportsReadingHighlight() || !audio || !segment) return null;

    const elements = findMessageTextElementById(options.sourceMessageId);
    if (!elements) return null;

    const snapshot = collectHighlightText(elements.textElement);
    const segmentIndexes = resolveSegmentHighlightIndexes(snapshot.text, segment, options.preferredStart);
    const validIndexes = segmentIndexes.filter((index) => snapshot.positions[index]);
    if (!validIndexes.length) return null;

    const token = Number(options.token) || Date.now();
    readingHighlightState.audio = audio;
    readingHighlightState.messageElement = elements.messageElement;
    readingHighlightState.textElement = elements.textElement;
    readingHighlightState.sourceText = snapshot.text;
    readingHighlightState.charPositions = snapshot.positions;
    readingHighlightState.segmentIndexes = validIndexes;
    readingHighlightState.currentLocalIndex = -1;
    readingHighlightState.lastScrolledLocalIndex = -1;
    readingHighlightState.token = token;
    elements.messageElement.classList.add("st-mimo-highlight-message");

    setReadingHighlightByLocalIndex(0);
    readingHighlightState.rafId = requestAnimationFrame(() => updateReadingHighlightFrame(token));
    return { nextSearchStart: validIndexes[validIndexes.length - 1] + 1 };
}

function updateReadingHighlightFrame(token) {
    if (readingHighlightState.token !== token) return;
    const audio = readingHighlightState.audio;
    if (!audio || !readingHighlightState.segmentIndexes.length) return;

    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (duration > 0) {
        const progress = Math.max(0, Math.min(audio.currentTime / duration, 0.999999));
        const localIndex = Math.min(
            readingHighlightState.segmentIndexes.length - 1,
            Math.floor(progress * readingHighlightState.segmentIndexes.length),
        );
        setReadingHighlightByLocalIndex(localIndex);
    }

    if (!audio.ended) {
        readingHighlightState.rafId = requestAnimationFrame(() => updateReadingHighlightFrame(token));
    }
}

function getReadableHighlightLocalIndex(localIndex) {
    const indexes = readingHighlightState.segmentIndexes;
    const source = readingHighlightState.sourceText;
    const start = Math.max(0, Math.min(localIndex, indexes.length - 1));
    for (let index = start; index < indexes.length; index += 1) {
        if (!/\s/u.test(source[indexes[index]] || "")) return index;
    }
    for (let index = start; index >= 0; index -= 1) {
        if (!/\s/u.test(source[indexes[index]] || "")) return index;
    }
    return indexes.length ? start : -1;
}

function setReadingHighlightByLocalIndex(localIndex) {
    const readableLocalIndex = getReadableHighlightLocalIndex(localIndex);
    if (readableLocalIndex < 0 || readableLocalIndex === readingHighlightState.currentLocalIndex) return;

    const absoluteIndex = readingHighlightState.segmentIndexes[readableLocalIndex];
    const position = readingHighlightState.charPositions[absoluteIndex];
    if (!position?.node) return;

    const text = position.node.nodeValue || "";
    if (position.offset >= text.length) return;

    const range = document.createRange();
    let endOffset = position.offset + 1;
    if (/[\uD800-\uDBFF]/u.test(text[position.offset]) && /[\uDC00-\uDFFF]/u.test(text[position.offset + 1] || "")) {
        endOffset += 1;
    }
    range.setStart(position.node, position.offset);
    range.setEnd(position.node, Math.min(endOffset, text.length));
    CSS.highlights.set(READING_HIGHLIGHT_NAME, new globalThis.Highlight(range));
    readingHighlightState.currentLocalIndex = readableLocalIndex;
    maybeScrollReadingHighlightIntoView(range, readableLocalIndex);
}

function maybeScrollReadingHighlightIntoView(range, localIndex) {
    if (Math.abs(localIndex - readingHighlightState.lastScrolledLocalIndex) < 18) return;
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const topLimit = 90;
    const bottomLimit = window.innerHeight - 90;
    if (rect.top >= topLimit && rect.bottom <= bottomLimit) return;
    range.startContainer?.parentElement?.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
    });
    readingHighlightState.lastScrolledLocalIndex = localIndex;
}

function cleanupActiveAudio(options = {}) {
    stopReadingHighlight();
    if (activeAbortController && options.abort !== false) {
        activeAbortController.abort();
    }
    activeAbortController = null;

    if (activeAudio) {
        activeAudio.onended = null;
        activeAudio.onerror = null;
        activeAudio.pause();
        activeAudio.removeAttribute("src");
        activeAudio.load?.();
        activeAudio = null;
    }
    if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = "";
    }
}

async function playTextSegments(text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
        notify("warning", "MiMo TTS 尚未启用。");
        return;
    }

    const sourceMessageId = options.sourceMessageId ?? null;
    const requestKey = buildPlaybackRequestKey(text, sourceMessageId);
    if (shouldSkipDuplicatePlayback(requestKey, options)) {
        setStatus("已跳过重复朗读请求", "ok");
        return;
    }

    const roleGroup = options.roleGroup || await refreshPlaybackRoleGroup(settings, text);
    const segments = buildPlaybackSegments(text, settings, roleGroup);
    if (!segments.length) {
        notify("warning", "这段内容不在 MiMo 正文朗读范围内。");
        return;
    }

    cleanupActiveAudio();
    playbackState.segments = segments;
    playbackState.currentIndex = 0;
    playbackState.sourceMessageId = sourceMessageId;
    playbackState.profile = options.profile || ensureFixedNarrator(settings);
    playbackState.mode = "idle";
    playbackState.highlightCursor = 0;
    playbackState.activeRequestKey = requestKey;
    playbackState.lastRequestKey = requestKey;
    playbackState.lastRequestAt = Date.now();
    if (Number.isFinite(Number(sourceMessageId))) {
        playbackState.lastPlayedMessageId = Number(sourceMessageId);
        playbackState.lastPlayedMessageAt = playbackState.lastRequestAt;
    }
    if (options.auto) {
        playbackState.lastAutoReadKey = requestKey;
        playbackState.lastAutoReadAt = playbackState.lastRequestAt;
        if (Number.isFinite(Number(sourceMessageId))) {
            playbackState.lastAutoReadMessageId = Number(sourceMessageId);
            playbackState.lastAutoReadMessageAt = playbackState.lastRequestAt;
        }
    }
    updateFloatingPlayer();
    await playCurrentSegment();
}

async function playCurrentSegment() {
    if (!playbackState.segments.length) return;
    playbackState.currentIndex = Math.max(0, Math.min(playbackState.currentIndex, playbackState.segments.length - 1));
    const token = playbackState.requestToken + 1;
    playbackState.requestToken = token;
    cleanupActiveAudio();

    const segment = playbackState.segments[playbackState.currentIndex];
    const segmentText = getPlaybackSegmentText(segment);
    const segmentRawText = getPlaybackSegmentRawText(segment);
    const segmentProfile = getPlaybackSegmentProfile(segment, playbackState.profile);
    const segmentSpeaker = getPlaybackSegmentSpeaker(segment);
    activeAbortController = new AbortController();
    playbackState.mode = "loading";
    setStatus(`正在合成 ${playbackState.currentIndex + 1}/${playbackState.segments.length} · ${segmentSpeaker}`, "busy");

    try {
        const metadata = {
            sourceMessageId: playbackState.sourceMessageId,
            segmentIndex: playbackState.currentIndex + 1,
            totalSegments: playbackState.segments.length,
            speakerName: segmentSpeaker,
            profileType: typeof segment === "string" ? "narrator" : segment.profileType,
        };
        recordLastTtsText(segmentRawText, metadata);
        const blob = await requestMimoAudio(segmentText, activeAbortController.signal, segmentProfile);
        if (playbackState.requestToken !== token) {
            return;
        }
        await saveGeneratedAudioQuietly(blob, segmentRawText, metadata);
        if (playbackState.requestToken !== token) {
            return;
        }

        activeAudioUrl = URL.createObjectURL(blob);
        activeAudio = new Audio();
        activeAudio.src = activeAudioUrl;
        applyAudioElementPlaybackRate(activeAudio);
        bindAudioPlaybackRate(activeAudio);
        const highlightResult = startReadingHighlight(activeAudio, segmentRawText, {
            sourceMessageId: playbackState.sourceMessageId,
            preferredStart: playbackState.currentIndex === 0 ? 0 : playbackState.highlightCursor,
            token,
        });
        if (highlightResult?.nextSearchStart) {
            playbackState.highlightCursor = highlightResult.nextSearchStart;
        }
        activeAudio.onended = () => {
            if (playbackState.requestToken !== token) return;
            if (playbackState.currentIndex < playbackState.segments.length - 1) {
                playbackState.currentIndex += 1;
                playCurrentSegment().catch((error) => {
                    const message = error?.message || String(error);
                    setStatus(message, "error");
                    notify("error", message);
                });
                return;
            }
            stopReadingHighlight();
            playbackState.mode = "idle";
            setStatus("播放完成", "ok");
        };
        activeAudio.onerror = () => {
            stopReadingHighlight();
            playbackState.mode = "idle";
            setStatus("音频播放失败", "error");
        };
        await activeAudio.play();
        applyAudioElementPlaybackRate(activeAudio);
        playbackState.mode = "playing";
        setStatus(`正在播放 ${playbackState.currentIndex + 1}/${playbackState.segments.length} · ${segmentSpeaker}`, "ok");
    } catch (error) {
        if (error.name === "AbortError") {
            if (playbackState.requestToken === token) {
                stopReadingHighlight();
                playbackState.mode = "idle";
                setStatus("已停止", "");
            }
            return;
        }
        stopReadingHighlight();
        playbackState.mode = "idle";
        const message = error?.message || String(error);
        setStatus(message, "error");
        notify("error", message);
    } finally {
        if (playbackState.requestToken === token) activeAbortController = null;
        updateFloatingPlayer();
    }
}

async function togglePlayerPlayback() {
    if (playbackState.mode === "playing" && activeAudio) {
        activeAudio.pause();
        playbackState.mode = "paused";
        setStatus(`已暂停 ${playbackState.currentIndex + 1}/${playbackState.segments.length} · ${getCurrentPlaybackSpeaker()}`, "");
        return;
    }

    if (playbackState.mode === "paused" && activeAudio) {
        applyAudioElementPlaybackRate(activeAudio);
        await activeAudio.play();
        applyAudioElementPlaybackRate(activeAudio);
        playbackState.mode = "playing";
        setStatus(`正在播放 ${playbackState.currentIndex + 1}/${playbackState.segments.length} · ${getCurrentPlaybackSpeaker()}`, "ok");
        return;
    }

    if (playbackState.mode === "loading") {
        stopPlayback();
        return;
    }

    await playLatestAssistantMessage();
}

async function playAdjacentSegment(direction) {
    if (!playbackState.segments.length) {
        await playLatestAssistantMessage();
        return;
    }

    const nextIndex = Math.max(0, Math.min(playbackState.currentIndex + direction, playbackState.segments.length - 1));
    if (nextIndex === playbackState.currentIndex && playbackState.mode !== "idle") return;
    playbackState.currentIndex = nextIndex;
    await playCurrentSegment();
}

async function synthesizeAndPlay(text, options = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
        notify("warning", "MiMo TTS 尚未启用。");
        return;
    }
    const readableText = prepareTtsText(text, settings);
    if (!readableText) {
        notify("warning", "这段内容不在 MiMo 正文朗读范围内。");
        return;
    }

    stopPlayback({ silent: true });
    activeAbortController = new AbortController();
    setStatus("正在请求 MiMo...", "busy");

    try {
        const metadata = {
            sourceMessageId: options.sourceMessageId ?? null,
            segmentIndex: 1,
            totalSegments: 1,
        };
        recordLastTtsText(readableText, metadata);
        const blob = await requestMimoAudio(readableText, activeAbortController.signal, options.profile);
        await saveGeneratedAudioQuietly(blob, readableText, metadata);
        activeAudioUrl = URL.createObjectURL(blob);
        activeAudio = options.attachPreview ? byId("st-mimo-preview-audio") : new Audio();
        activeAudio.src = activeAudioUrl;
        applyAudioElementPlaybackRate(activeAudio, getPlaybackRate(settings));
        bindAudioPlaybackRate(activeAudio);
        activeAudio.onended = () => setStatus("播放完成", "ok");
        activeAudio.onerror = () => setStatus("音频播放失败", "error");
        await activeAudio.play();
        applyAudioElementPlaybackRate(activeAudio);
        setStatus("正在播放", "ok");
    } catch (error) {
        if (error.name === "AbortError") {
            setStatus("已停止", "");
            return;
        }
        const message = error?.message || String(error);
        setStatus(message, "error");
        notify("error", message);
    } finally {
        activeAbortController = null;
    }
}

function stopPlayback(options = {}) {
    playbackState.requestToken += 1;
    playbackState.mode = "idle";
    cleanupActiveAudio();
    if (!options.silent) setStatus("已停止", "");
    else updateFloatingPlayer();
}

function addMessageButtons() {
    const settings = getSettings();
    if (!settings.enabled) return;
    const chat = safeGetContext()?.chat || [];
    for (const mes of document.querySelectorAll("#chat .mes")) {
        const existingButton = mes.querySelector(".st-mimo-message-button");
        if (!isAssistantMessageElement(mes, chat)) {
            existingButton?.remove();
            continue;
        }
        if (existingButton) continue;
        const host = mes.querySelector(".mes_buttons") || mes.querySelector(".mes_block");
        if (!host) continue;
        const button = document.createElement("div");
        button.className = "mes_button st-mimo-message-button fa-solid fa-volume-high";
        button.title = "MiMo TTS";
        button.setAttribute("aria-label", "MiMo TTS");
        button.tabIndex = 0;
        host.appendChild(button);
    }
}

function bindMessageButtonEvents() {
    document.addEventListener("click", async (event) => {
        const button = event.target.closest(".st-mimo-message-button");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const mes = button.closest(".mes");
        if (mes) await readMessageElement(mes);
    });
}

async function readMessageElement(mes) {
    if (!isAssistantMessageElement(mes)) {
        notify("warning", "MiMo TTS 只朗读助手回复楼层。");
        return;
    }
    const text = getMessageText(mes);
    if (!text) {
        notify("warning", "这条消息没有可朗读文本。");
        return;
    }
    await playTextSegments(text, { sourceMessageId: getMessageElementId(mes) });
}

function getMessageText(mes, options = {}) {
    const context = safeGetContext();
    const id = Number(mes.getAttribute("mesid"));
    const messageText = Number.isFinite(id) ? String(context?.chat?.[id]?.mes || "").trim() : "";
    const domText = getReadableDomMessageText(mes);
    if (hasTtsSourceMarkup(messageText) || hasGeneratedRuleMarkers(messageText)) return messageText;
    if (options.preferDom !== false && domText) return domText;
    return messageText || domText;
}

function hasTtsSourceMarkup(text) {
    return /(?:<\/?(?:content|正文|body|message|think|thinking|reasoning|analysis|metacognition|image|prompt|time)(?:\s|>)|@bubble:|\[(?:\/?content|\/?image|metacognition|analysis|thinking|reasoning)\])/iu
        .test(String(text || ""));
}

function getReadableDomMessageText(mes) {
    const textElement = mes?.querySelector?.(".mes_text");
    if (!textElement) return "";
    const clone = textElement.cloneNode(true);
    for (const element of clone.querySelectorAll("script, style, textarea, input, button, select, option, .mes_buttons, .extraMesButtons, .swipe_right, .swipe_left, .reasoning, .mes_reasoning, .thinking, .hidden, [hidden], [aria-hidden='true']")) {
        element.remove();
    }
    for (const element of Array.from(clone.querySelectorAll("*"))) {
        const style = element.getAttribute("style") || "";
        if (/display\s*:\s*none|visibility\s*:\s*hidden/iu.test(style)) element.remove();
    }
    return (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function stripHtml(value) {
    const text = String(value || "");
    if (!/<[a-z][\s\S]*>/i.test(text)) return text.trim();
    const element = document.createElement("div");
    element.innerHTML = text;
    return (element.textContent || element.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

async function readLatestAssistantMessage(options = {}) {
    await playLatestAssistantMessage(options);
}

async function playLatestAssistantMessage(options = {}) {
    const latest = getLatestAssistantMessage();
    if (latest) {
        await playTextSegments(latest.message.mes, {
            sourceMessageId: latest.index,
            auto: Boolean(options.auto),
            force: Boolean(options.force),
        });
        return;
    }
    notify("warning", "未找到可朗读的助手回复。");
}

function getLatestAssistantMessage() {
    const context = safeGetContext();
    const chat = context?.chat || [];
    const latestElement = getLatestVisibleAssistantMessageElement(chat);
    if (latestElement) {
        const index = getMessageElementId(latestElement);
        const message = Number.isFinite(index) ? (chat[index] || {}) : {};
        const text = getMessageText(latestElement, { preferDom: true });
        if (text) return { message: { ...message, mes: text }, index, element: latestElement };
    }

    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const message = chat[i];
        if (!message?.is_user && !message?.is_system && message?.mes) {
            return { message, index: i };
        }
    }
    return null;
}

function getMessageElementId(mes) {
    const id = Number(mes?.getAttribute?.("mesid"));
    return Number.isFinite(id) ? id : NaN;
}

function getContextMessageByElement(mes, chat = safeGetContext()?.chat || []) {
    const id = getMessageElementId(mes);
    return Number.isFinite(id) ? chat[id] : null;
}

function isVisibleMessageElement(mes) {
    if (!mes) return false;
    const style = getComputedStyle(mes);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = mes.getBoundingClientRect();
    return Boolean(rect.width || rect.height);
}

function isAssistantMessageElement(mes, chat = safeGetContext()?.chat || []) {
    const message = getContextMessageByElement(mes, chat);
    if (message) {
        const domText = mes.querySelector(".mes_text")?.innerText?.trim();
        return !message.is_user && !message.is_system && (Boolean(message.mes) || Boolean(domText));
    }
    return !mes.classList.contains("user_mes") && !mes.classList.contains("system_mes");
}

function getLatestVisibleAssistantMessageElement(chat = safeGetContext()?.chat || []) {
    const messages = Array.from(document.querySelectorAll("#chat .mes[mesid]"));
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const mes = messages[index];
        if (!isVisibleMessageElement(mes) || !isAssistantMessageElement(mes, chat)) continue;
        if (getMessageText(mes, { preferDom: true })) return mes;
    }
    return null;
}

function safeGetContext() {
    try {
        return getContext();
    } catch {
        return {};
    }
}

function insertAtCursor(textarea, value) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const needsSpaceBefore = before && !/\s$/.test(before) ? " " : "";
    const needsSpaceAfter = after && !/^\s/.test(after) ? " " : "";
    textarea.value = `${before}${needsSpaceBefore}${value}${needsSpaceAfter}${after}`;
    const nextPosition = before.length + needsSpaceBefore.length + value.length;
    textarea.setSelectionRange(nextPosition, nextPosition);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
}

function startMessageObserver() {
    addMessageButtons();
    const chat = byId("chat");
    if (chat && !messageObserver) {
        messageObserver = new MutationObserver(() => window.requestAnimationFrame(addMessageButtons));
        messageObserver.observe(chat, { childList: true, subtree: true });
    }
    if (eventSource?.on) {
        if (event_types?.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(addMessageButtons, 250));
        if (event_types?.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, () => {
                if (!getSettings().autoReadNewAssistant) return;
                scheduleAutoReadLatestAssistant();
            });
        }
    }
}

function scheduleAutoReadLatestAssistant() {
    if (autoReadTimer) clearTimeout(autoReadTimer);
    autoReadTimer = setTimeout(() => {
        autoReadTimer = null;
        readLatestAssistantMessage({ auto: true }).catch((error) => {
            const message = error?.message || String(error);
            setStatus(message, "error");
            notify("error", message);
        });
    }, AUTO_READ_DELAY_MS);
}

function startSyncSkillListeners() {
    if (!eventSource?.on) return;
    const events = [
        event_types?.CHAT_CHANGED,
        event_types?.CHARACTER_EDITED,
        event_types?.CHARACTER_RENAMED,
        event_types?.PRESET_CHANGED,
        event_types?.OAI_PRESET_CHANGED_AFTER,
        event_types?.WORLDINFO_SETTINGS_UPDATED,
    ].filter(Boolean);

    for (const eventName of events) {
        eventSource.on(eventName, () => scheduleAutoSync());
    }
}

function scheduleAutoSync() {
    const settings = getSettings();
    if (!settings.syncSkill.autoSyncOnContextChange) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
        runSyncSkill({ roleGroup: true, regex: true }).catch((error) => {
            console.warn("[MiMo TTS] Auto sync failed", error);
            notify("error", `同步技能失败：${error?.message || error}`);
        });
    }, 1500);
}

function normalizeToggleIntent(value, fallback = "toggle") {
    const text = String(value || fallback).trim().toLocaleLowerCase();
    if (["on", "enable", "enabled", "show", "true", "1", "yes", "open", "开启", "打开", "显示", "开"].includes(text)) return "on";
    if (["off", "disable", "disabled", "hide", "false", "0", "no", "close", "关闭", "隐藏", "关"].includes(text)) return "off";
    return "toggle";
}

function runFloatingControlsCommand(value) {
    const intent = normalizeToggleIntent(value);
    if (intent === "on") return setFloatingControlsVisible(true);
    if (intent === "off") return setFloatingControlsVisible(false);
    return toggleFloatingControls();
}

function runPanelCommand(value) {
    const intent = normalizeToggleIntent(value);
    if (intent === "on") {
        openPanel();
        return "on";
    }
    if (intent === "off") {
        closePanel();
        return "off";
    }
    if (byId(PANEL_ID)?.hidden) {
        openPanel();
        return "on";
    }
    closePanel();
    return "off";
}

async function runFullscreenCommand(value) {
    const intent = normalizeToggleIntent(value);
    if (intent === "on" && isFullscreenActive()) return "on";
    if (intent === "off" && !isFullscreenActive()) return "off";
    await toggleFullscreen();
    return isFullscreenActive() ? "on" : "off";
}

function registerSlashCommands() {
    if (appState.slashCommandsRegistered) return;
    appState.slashCommandsRegistered = true;

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: "mimo-float",
        aliases: ["mimo-tts-float", "st-mimo-float"],
        returns: "on/off",
        callback: (_args, value) => runFloatingControlsCommand(value),
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: "on/off/toggle",
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: "toggle",
                enumList: ["on", "off", "toggle"],
            }),
        ],
        helpString: `
            <div>Show, hide, or toggle MiMo TTS Lite floating controls.</div>
            <div><strong>Examples:</strong></div>
            <pre><code>/mimo-float on
/mimo-float off
/mimo-float toggle</code></pre>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: "mimo-panel",
        aliases: ["mimo-tts-panel", "st-mimo-panel"],
        returns: "on/off",
        callback: (_args, value) => runPanelCommand(value),
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: "on/off/toggle",
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: "toggle",
                enumList: ["on", "off", "toggle"],
            }),
        ],
        helpString: `
            <div>Open, close, or toggle the MiMo TTS Lite full UI.</div>
            <pre><code>/mimo-panel toggle</code></pre>
        `,
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: "mimo-fullscreen",
        aliases: ["mimo-tts-fullscreen", "st-mimo-fullscreen"],
        returns: "on/off",
        callback: async (_args, value) => runFullscreenCommand(value),
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: "on/off/toggle",
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: "toggle",
                enumList: ["on", "off", "toggle"],
            }),
        ],
        helpString: `
            <div>Enter, exit, or toggle browser fullscreen for MiMo TTS Lite.</div>
            <pre><code>/mimo-fullscreen toggle</code></pre>
        `,
    }));
}

function exposeApi() {
    window.stMimoTts = {
        synthesize: synthesizeAndPlay,
        playLatest: playLatestAssistantMessage,
        playSegments: playTextSegments,
        stop: stopPlayback,
        openPanel,
        closePanel,
        setFloatingControls: setFloatingControlsVisible,
        toggleFloatingControls,
        toggleFullscreen,
        setTtsSpeedRate,
        adjustTtsSpeedRate,
        setPlaybackRate,
        adjustPlaybackRate,
        settings: getSettings,
        buildPayload: (text) => {
            const settings = getSettings();
            const active = getActiveProfile(settings);
            return buildRequestPayload(text, getProfileConfig(active?.profile, settings));
        },
        exportAll,
        importAll,
        sync: runSyncSkill,
    };
}

function init() {
    if (appState.initialized) return;
    appState.initialized = true;
    getSettings();
    renderAll();
    bindGlobalEvents();
    bindMessageButtonEvents();
    startMessageObserver();
    startSyncSkillListeners();
    exposeApi();
    registerSlashCommands();
}

if (eventSource?.on && event_types?.APP_READY) {
    eventSource.on(event_types.APP_READY, init);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    setTimeout(init, 0);
}
