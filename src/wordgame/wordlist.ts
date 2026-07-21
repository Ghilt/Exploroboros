// A curated PLACEHOLDER word list (common English words, 3–7 letters) so the game is playable now.
// It is deliberately small — the real dictionary is a later data decision: the official Scrabble list
// (NWL/TWL) is copyrighted, so the likely swap is an open list (e.g. ENABLE / public-domain), loaded
// as its own lazy chunk. Nothing else changes when it lands: buildDictionary just takes more words.
// Kept lowercase; deduped when the trie is built.
const RAW = `
the and cat dog sun run fun bat hat cap map tap top pot pit pin pen pan can man ran tan fan car bar
ear eat tea sea set sit six mix fix box fox bed red fed leg big dig fig pig wig bag tag rag jam ham
had bad dad mad sad cab fat mat rat sat war jar tar fur cut gut hut nut but bus bun gun sin win tin
bin fin kit bit hit sip tip rip dip lip zip cop mop hop pop nod rod god hot lot dot got not cow how
now bow low row sow toy joy boy day way say hay lay may pay ray bay key sky fly cry dry try age ace
ice ivy oak odd off oil old one out owl own pea pie toe two use who why yes yet zoo ten hen men pet
net jet wet vet get let bet ask arm art bee bug cup dam den dew ebb elf elk fit gem hip hub ink lad
lag lit log mob mud oar orb pad paw pod pub rub rug sea tab tow tug urn van vow wax web wed yak yew
able also area army away baby back ball band bank base bath bean bear beat been beef beer bell belt
bend best bird bite blue boat body bold bone book boot born both bowl burn busy cake call calm camp
card care cart case cash cast cave cell chat chip city clay clip club coal coat code cold come cook
cool copy corn cost crew crop cube cure cute damp dark dawn dead deal dear deck deep deer desk dial
diet dirt dish dock does done door dose down drag draw drop drum duck dull dust duty each earn ease
east easy edge exit face fact fade fail fair fall farm fast fate fear feed feel feet fell felt file
fill film find fine fire firm fish five flag flat flee flip flow foam fold folk food fool foot form
fort four free frog from fuel full fund gain game gate gave gear gift girl give glad goal goat goes
gold golf gone good grab gray grew grip grow hair half hall hand hang hard harm hate have head heal
hear heat heel held hell help herd here hero hide high hill hint hire hold hole holy home hook hope
horn host hour huge hunt hurt icon idea inch into iron item join joke jump jury just keen keep kept
kick kill kind king kiss knee knew know lace lack lady laid lake lamp land lane last late lawn lazy
lead leaf lean leap left lend lens less lift like lime line link lion list live load loan lock lone
long look loop lord lose loss lost loud love luck lump lung made mail main make male mall many mark
mask mass mate meal mean meat meet melt menu mere mess mild mile milk mill mind mine mint miss mist
mode mold mood moon more most move much must nail name near neat neck need nest news next nice nine
node none noon nose note noun obey omit once only onto open oral oven over pace pack page paid pain
pair pale palm park part pass past path peak peel peer pile pill pine pink pint pipe plan play plot
plug plus poem poet pole poll pond pony pool poor port pose post pour pray prey pull pump pure push
quit race rack rage raid rail rain rank rare rate read real rear reef reel rely rent rest rice rich
ride ring riot ripe rise risk road roar robe rock role roll roof room root rope rose ruby rude rule
rush rust sack safe sage said sail sake sale salt same sand save scan seal seat seed seek seem seen
self sell send sent ship shoe shop shot show shut sick side sigh sign silk sing sink site size skin
skip slab slam slap slim slip slot slow snap snow soak soap soar sock soda sofa soft soil sold sole
some song soon sort soul soup sour spin spot star stay stem step stir stop such suit sung sure surf
swam swan swim tail take tale talk tall tame tank tape task team tear teen tell tend tent term test
text than that them then they thin this thus tide tied tile till tilt time tiny tire toad told toll
tomb tone tool tore torn tour town trap tray tree trim trip true tube tuna tune turn twin type ugly
unit upon urge used user vain vary vase vast veil vein verb very vest veto vice view vine void volt
vote wade wage wait wake walk wall wand want ward warm warn wash wave weak wear weed week weep well
went were west what when whom wide wife wild will wind wine wing wink wipe wire wise wish with wolf
wood wool word wore work worm worn wrap yard yarn year yell your zero zone zoom
about above admit adopt adult after again agent agree ahead alarm album alert alien alike alive
allow alone along aloud alter among angel anger angle angry ankle apart apple apply arena argue
arise armor array arrow aside asset audio audit avoid awake award aware basic beach beard beast
began begin being below bench berry birth black blade blame blank blast blaze bleed blend bless
blind block blood bloom board boast bonus boost booth bound brain brake brand brave bread break
breed brick bride brief bring broad broke brown brush build built bunch burst cabin cable candy
cargo carry catch cause chain chair chalk charm chart chase cheap check cheek cheer chess chest
chief child chill choir chose civil claim clash class clean clear clerk click cliff climb clock
close cloth cloud clown coach coast could count court cover crack craft crash crazy cream crime
crisp cross crowd crown crush curve cycle daily dairy dance death debut delay dense depth diary
dirty ditch dozen draft drain drama drank dream dress dried drift drill drink drive drove drown
eager eagle early earth eight elbow elder elect elite empty enemy enjoy enter entry equal error
essay event every exact exist extra fable faint fairy faith false fancy fatal fault feast fence
fetch fever fiber field fifth fifty fight final first flame flash fleet flesh float flock flood
floor flour fluid flush focus force forge forth forty found frame fraud fresh front frost fruit
funny ghost giant given glass globe glory glove grace grade grain grand grant grape grasp grass
grave great greed green greet grief grill grind groan groom gross group grove grown guard guess
guest guide guilt habit handy happy harsh haste hatch heart heavy hedge hello honey honor horse
hotel house human humor hurry ideal image index inner input issue ivory jelly jewel joint judge
juice knife knock known label labor large laser later laugh layer learn lease least leave legal
lemon level light limit linen liver lobby local lodge logic loose lover lower loyal lucky lunar
lunch magic major maker maple march match mayor meant medal media mercy merge merit metal meter
might minor minus model money month moral motor mount mouse mouth movie music naked nasty naval
nerve never newly night noble noise north novel nurse ocean offer often olive onion opera orbit
order organ other ought ounce outer owner paint panel panic paper party pasta patch pause peace
peach pearl pedal penny phase phone photo piano piece pilot pinch pitch pixel pizza place plain
plane plant plate plaza point polar porch pound power press price pride prime print prior prize
proof proud prove pulse pupil puppy purse queen quest quick quiet quite quote radar radio raise
rally ranch range rapid ratio reach react ready realm rebel refer relax reply rider ridge rifle
right rigid rinse rival river roast robot rocky roman rough round route royal ruler rural rusty
saint salad salon sauce scale scare scarf scene scent scope score scout scrap screw sense serve
setup seven shade shake shall shame shape share shark sharp sheep sheet shelf shell shift shine
shiny shirt shock shoot shore short shout shown siege sight silly since siren sixth sixty skill
skull slate sleep slice slide slope small smart smash smell smile smoke snack snake sneak solar
solid solve sonic sorry sound south space spare spark speak spear speed spell spend spice spike
spill spine spite split spoke spoon sport spray stack staff stage stain stair stake stale stall
stamp stand stare start state steam steel steep steer stern stick stiff still sting stock stone
stood stool store storm story stove strap straw strip study stuff style sugar suite sunny super
sweat sweep sweet swept swing sword table taken taste teach teeth tempo tenth thank theft their
theme there these thick thief thing think third those three threw throw thumb tiger tight timer
tired title toast today token tooth topic torch total touch tough tower toxic trace track trade
trail train trait trash tread treat trend trial tribe trick tried troop trout truck truly trunk
trust truth tulip tumor tutor twice twist ultra uncle under union unite unity until upper upset
urban usage usual vague valid value valve vapor vault venue verse video villa vinyl viola virus
visit vital vivid vocal voice voter vowel wagon waist waste watch water weary weave weigh weird
whale wheat wheel where which while white whole whose widen width witch woman women world worry
worse worst worth would wound wrist write wrong wrote yacht yield young youth zebra
`

export const WORDLIST: ReadonlyArray<string> = RAW.split(/\s+/).filter(Boolean)
