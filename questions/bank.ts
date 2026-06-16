import { Question } from '../src/shared/types.js';

export const questionBank: Question[] = [
  // Science & Nature (1-20)
  { id: 'q001', text: 'What is the chemical symbol for water?', options: ['H2O', 'CO2', 'NaCl', 'O2'], correctIndex: 0, category: 'Science', difficulty: 1 },
  { id: 'q002', text: 'How many planets are in our solar system?', options: ['7', '8', '9', '10'], correctIndex: 1, category: 'Science', difficulty: 1 },
  { id: 'q003', text: 'What gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], correctIndex: 2, category: 'Science', difficulty: 1 },
  { id: 'q004', text: 'What is the hardest natural substance on Earth?', options: ['Gold', 'Iron', 'Diamond', 'Quartz'], correctIndex: 2, category: 'Science', difficulty: 1 },
  { id: 'q005', text: 'What is the speed of light approximately?', options: ['300,000 km/s', '150,000 km/s', '1,000 km/s', '3,000 km/s'], correctIndex: 0, category: 'Science', difficulty: 2 },
  { id: 'q006', text: 'Which organ produces insulin in the human body?', options: ['Liver', 'Kidney', 'Pancreas', 'Stomach'], correctIndex: 2, category: 'Science', difficulty: 2 },
  { id: 'q007', text: 'What is the most abundant gas in Earth\'s atmosphere?', options: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Argon'], correctIndex: 2, category: 'Science', difficulty: 2 },
  { id: 'q008', text: 'How many bones are in the adult human body?', options: ['196', '206', '216', '256'], correctIndex: 1, category: 'Science', difficulty: 2 },
  { id: 'q009', text: 'What is the largest organ in the human body?', options: ['Liver', 'Brain', 'Skin', 'Heart'], correctIndex: 2, category: 'Science', difficulty: 1 },
  { id: 'q010', text: 'What planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctIndex: 1, category: 'Science', difficulty: 1 },
  { id: 'q011', text: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi Body'], correctIndex: 2, category: 'Science', difficulty: 2 },
  { id: 'q012', text: 'What element has the atomic number 1?', options: ['Helium', 'Hydrogen', 'Lithium', 'Carbon'], correctIndex: 1, category: 'Science', difficulty: 2 },
  { id: 'q013', text: 'What is the boiling point of water in Celsius?', options: ['90°C', '100°C', '110°C', '120°C'], correctIndex: 1, category: 'Science', difficulty: 1 },
  { id: 'q014', text: 'Which vitamin is produced when skin is exposed to sunlight?', options: ['Vitamin A', 'Vitamin B', 'Vitamin C', 'Vitamin D'], correctIndex: 3, category: 'Science', difficulty: 2 },
  { id: 'q015', text: 'What is the largest mammal on Earth?', options: ['Elephant', 'Blue Whale', 'Giraffe', 'Hippopotamus'], correctIndex: 1, category: 'Science', difficulty: 1 },
  { id: 'q016', text: 'What force keeps us on the ground?', options: ['Magnetism', 'Gravity', 'Friction', 'Inertia'], correctIndex: 1, category: 'Science', difficulty: 1 },
  { id: 'q017', text: 'How many chambers does a human heart have?', options: ['2', '3', '4', '5'], correctIndex: 2, category: 'Science', difficulty: 2 },
  { id: 'q018', text: 'What is DNA\'s shape?', options: ['Single helix', 'Double helix', 'Triple helix', 'Linear strand'], correctIndex: 1, category: 'Science', difficulty: 2 },
  { id: 'q019', text: 'Which blood type is the universal donor?', options: ['A', 'B', 'AB', 'O negative'], correctIndex: 3, category: 'Science', difficulty: 2 },
  { id: 'q020', text: 'What is the center of an atom called?', options: ['Electron', 'Proton', 'Nucleus', 'Neutron'], correctIndex: 2, category: 'Science', difficulty: 2 },

  // History (21-40)
  { id: 'q021', text: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q022', text: 'Who was the first President of the United States?', options: ['John Adams', 'George Washington', 'Thomas Jefferson', 'Benjamin Franklin'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q023', text: 'Which ancient civilization built the pyramids of Giza?', options: ['Roman', 'Greek', 'Egyptian', 'Mayan'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q024', text: 'The Great Wall of China was primarily built to protect against whom?', options: ['Japanese', 'Mongols', 'Russians', 'Koreans'], correctIndex: 1, category: 'History', difficulty: 2 },
  { id: 'q025', text: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q026', text: 'In what year did the Titanic sink?', options: ['1910', '1912', '1914', '1916'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q027', text: 'Which country gifted the Statue of Liberty to the USA?', options: ['England', 'France', 'Spain', 'Germany'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q028', text: 'Who discovered America in 1492?', options: ['Vasco da Gama', 'Ferdinand Magellan', 'Christopher Columbus', 'Amerigo Vespucci'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q029', text: 'The French Revolution began in which year?', options: ['1776', '1789', '1799', '1804'], correctIndex: 1, category: 'History', difficulty: 2 },
  { id: 'q030', text: 'Who wrote "I Have a Dream" speech?', options: ['Malcolm X', 'Martin Luther King Jr.', 'Rosa Parks', 'Barack Obama'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q031', text: 'Which empire was ruled by Genghis Khan?', options: ['Ottoman', 'Roman', 'Mongol', 'Persian'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q032', text: 'The Berlin Wall fell in which year?', options: ['1987', '1989', '1991', '1993'], correctIndex: 1, category: 'History', difficulty: 2 },
  { id: 'q033', text: 'Who was the first person to walk on the Moon?', options: ['Buzz Aldrin', 'Neil Armstrong', 'Yuri Gagarin', 'John Glenn'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q034', text: 'The Renaissance began in which country?', options: ['France', 'England', 'Italy', 'Spain'], correctIndex: 2, category: 'History', difficulty: 2 },
  { id: 'q035', text: 'Who invented the telephone?', options: ['Thomas Edison', 'Nikola Tesla', 'Alexander Graham Bell', 'Guglielmo Marconi'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q036', text: 'Which war was fought between North and South in the USA?', options: ['Revolutionary War', 'Civil War', 'Mexican War', 'Indian War'], correctIndex: 1, category: 'History', difficulty: 1 },
  { id: 'q037', text: 'Cleopatra was the queen of which country?', options: ['Greece', 'Rome', 'Egypt', 'Persia'], correctIndex: 2, category: 'History', difficulty: 1 },
  { id: 'q038', text: 'What year did India gain independence from Britain?', options: ['1945', '1947', '1950', '1952'], correctIndex: 1, category: 'History', difficulty: 2 },
  { id: 'q039', text: 'Who was the longest-reigning British monarch before Queen Elizabeth II?', options: ['Queen Victoria', 'King George III', 'King Henry VIII', 'King Edward VII'], correctIndex: 0, category: 'History', difficulty: 2 },
  { id: 'q040', text: 'The Magna Carta was signed in which year?', options: ['1066', '1215', '1492', '1776'], correctIndex: 1, category: 'History', difficulty: 3 },

  // Geography (41-60)
  { id: 'q041', text: 'What is the largest continent by area?', options: ['Africa', 'North America', 'Asia', 'Europe'], correctIndex: 2, category: 'Geography', difficulty: 1 },
  { id: 'q042', text: 'What is the longest river in the world?', options: ['Amazon', 'Nile', 'Mississippi', 'Yangtze'], correctIndex: 1, category: 'Geography', difficulty: 1 },
  { id: 'q043', text: 'Which country has the most population?', options: ['USA', 'India', 'China', 'Indonesia'], correctIndex: 1, category: 'Geography', difficulty: 1 },
  { id: 'q044', text: 'What is the capital of Japan?', options: ['Osaka', 'Kyoto', 'Tokyo', 'Nagoya'], correctIndex: 2, category: 'Geography', difficulty: 1 },
  { id: 'q045', text: 'Mount Everest is located on the border of which two countries?', options: ['India & China', 'Nepal & China', 'Nepal & India', 'China & Pakistan'], correctIndex: 1, category: 'Geography', difficulty: 2 },
  { id: 'q046', text: 'What is the smallest country in the world?', options: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'], correctIndex: 1, category: 'Geography', difficulty: 2 },
  { id: 'q047', text: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correctIndex: 3, category: 'Geography', difficulty: 1 },
  { id: 'q048', text: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], correctIndex: 2, category: 'Geography', difficulty: 2 },
  { id: 'q049', text: 'Which desert is the largest hot desert?', options: ['Gobi', 'Kalahari', 'Sahara', 'Arabian'], correctIndex: 2, category: 'Geography', difficulty: 1 },
  { id: 'q050', text: 'What country is known as the Land of the Rising Sun?', options: ['China', 'Japan', 'South Korea', 'Thailand'], correctIndex: 1, category: 'Geography', difficulty: 1 },
  { id: 'q051', text: 'Which is the largest island in the world?', options: ['Borneo', 'Madagascar', 'Greenland', 'New Guinea'], correctIndex: 2, category: 'Geography', difficulty: 2 },
  { id: 'q052', text: 'What is the capital of Brazil?', options: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'], correctIndex: 2, category: 'Geography', difficulty: 2 },
  { id: 'q053', text: 'How many continents are there?', options: ['5', '6', '7', '8'], correctIndex: 2, category: 'Geography', difficulty: 1 },
  { id: 'q054', text: 'Which river flows through Paris?', options: ['Thames', 'Rhine', 'Seine', 'Danube'], correctIndex: 2, category: 'Geography', difficulty: 2 },
  { id: 'q055', text: 'What is the tallest mountain in Africa?', options: ['Mount Kenya', 'Kilimanjaro', 'Mount Atlas', 'Mount Cameroon'], correctIndex: 1, category: 'Geography', difficulty: 2 },
  { id: 'q056', text: 'Which country is the largest by area?', options: ['Canada', 'China', 'USA', 'Russia'], correctIndex: 3, category: 'Geography', difficulty: 1 },
  { id: 'q057', text: 'What is the deepest ocean trench?', options: ['Tonga Trench', 'Mariana Trench', 'Puerto Rico Trench', 'Java Trench'], correctIndex: 1, category: 'Geography', difficulty: 2 },
  { id: 'q058', text: 'Which US state is the largest by area?', options: ['Texas', 'California', 'Alaska', 'Montana'], correctIndex: 2, category: 'Geography', difficulty: 2 },
  { id: 'q059', text: 'What is the capital of Canada?', options: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], correctIndex: 3, category: 'Geography', difficulty: 2 },
  { id: 'q060', text: 'Which sea lies between Europe and Africa?', options: ['Black Sea', 'Red Sea', 'Mediterranean Sea', 'Caspian Sea'], correctIndex: 2, category: 'Geography', difficulty: 1 },

  // Technology (61-80)
  { id: 'q061', text: 'Who co-founded Apple Inc. with Steve Jobs?', options: ['Bill Gates', 'Steve Wozniak', 'Elon Musk', 'Larry Page'], correctIndex: 1, category: 'Technology', difficulty: 2 },
  { id: 'q062', text: 'What does "HTML" stand for?', options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyper Transfer Markup Language'], correctIndex: 0, category: 'Technology', difficulty: 1 },
  { id: 'q063', text: 'In what year was the first iPhone released?', options: ['2005', '2006', '2007', '2008'], correctIndex: 2, category: 'Technology', difficulty: 2 },
  { id: 'q064', text: 'What programming language is known as the "language of the web"?', options: ['Python', 'Java', 'JavaScript', 'C++'], correctIndex: 2, category: 'Technology', difficulty: 1 },
  { id: 'q065', text: 'What does "CPU" stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], correctIndex: 0, category: 'Technology', difficulty: 1 },
  { id: 'q066', text: 'Who created the Linux operating system?', options: ['Bill Gates', 'Steve Jobs', 'Linus Torvalds', 'Richard Stallman'], correctIndex: 2, category: 'Technology', difficulty: 2 },
  { id: 'q067', text: 'What company developed the Android operating system?', options: ['Apple', 'Microsoft', 'Google', 'Samsung'], correctIndex: 2, category: 'Technology', difficulty: 1 },
  { id: 'q068', text: 'What does "URL" stand for?', options: ['Uniform Resource Locator', 'Universal Reference Link', 'United Resource Library', 'Unified Response Link'], correctIndex: 0, category: 'Technology', difficulty: 1 },
  { id: 'q069', text: 'Which company created the PlayStation?', options: ['Nintendo', 'Microsoft', 'Sony', 'Sega'], correctIndex: 2, category: 'Technology', difficulty: 1 },
  { id: 'q070', text: 'What is the most popular version control system?', options: ['SVN', 'Git', 'Mercurial', 'CVS'], correctIndex: 1, category: 'Technology', difficulty: 2 },
  { id: 'q071', text: 'What year was the World Wide Web invented?', options: ['1985', '1989', '1991', '1993'], correctIndex: 1, category: 'Technology', difficulty: 3 },
  { id: 'q072', text: 'What does "API" stand for?', options: ['Application Programming Interface', 'Advanced Program Integration', 'Automated Processing Input', 'Application Process Integration'], correctIndex: 0, category: 'Technology', difficulty: 2 },
  { id: 'q073', text: 'Which social media platform was founded by Mark Zuckerberg?', options: ['Twitter', 'Instagram', 'Facebook', 'Snapchat'], correctIndex: 2, category: 'Technology', difficulty: 1 },
  { id: 'q074', text: 'What is the binary representation of the number 10?', options: ['1000', '1001', '1010', '1100'], correctIndex: 2, category: 'Technology', difficulty: 2 },
  { id: 'q075', text: 'What does "RAM" stand for?', options: ['Random Access Memory', 'Read Access Memory', 'Rapid Auto Memory', 'Random Auto Memory'], correctIndex: 0, category: 'Technology', difficulty: 1 },
  { id: 'q076', text: 'Who founded Microsoft?', options: ['Steve Jobs', 'Bill Gates & Paul Allen', 'Larry Page', 'Jeff Bezos'], correctIndex: 1, category: 'Technology', difficulty: 1 },
  { id: 'q077', text: 'What is the latest stable version of HTTP?', options: ['HTTP/1.1', 'HTTP/2', 'HTTP/3', 'HTTP/4'], correctIndex: 2, category: 'Technology', difficulty: 3 },
  { id: 'q078', text: 'What programming language was created by Guido van Rossum?', options: ['Ruby', 'Python', 'Rust', 'Go'], correctIndex: 1, category: 'Technology', difficulty: 2 },
  { id: 'q079', text: 'What does "WiFi" NOT stand for?', options: ['Wireless Fidelity', 'Wireless Fiber', 'Wi-Fi is a brand name only', 'Wide Frequency'], correctIndex: 2, category: 'Technology', difficulty: 3 },
  { id: 'q080', text: 'Which company makes the Swift programming language?', options: ['Google', 'Microsoft', 'Apple', 'Facebook'], correctIndex: 2, category: 'Technology', difficulty: 2 },

  // Entertainment & Culture (81-100)
  { id: 'q081', text: 'Who wrote the Harry Potter book series?', options: ['J.R.R. Tolkien', 'J.K. Rowling', 'C.S. Lewis', 'George R.R. Martin'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q082', text: 'What is the highest-grossing film of all time (not adjusted)?', options: ['Avatar', 'Avengers: Endgame', 'Titanic', 'Star Wars: The Force Awakens'], correctIndex: 0, category: 'Entertainment', difficulty: 2 },
  { id: 'q083', text: 'Which band performed "Bohemian Rhapsody"?', options: ['The Beatles', 'Led Zeppelin', 'Queen', 'Pink Floyd'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q084', text: 'In which city is the Hollywood Walk of Fame?', options: ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q085', text: 'Who painted "Starry Night"?', options: ['Monet', 'Van Gogh', 'Picasso', 'Renoir'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q086', text: 'What is the name of Batman\'s butler?', options: ['James', 'Alfred', 'Lucius', 'Harvey'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q087', text: 'Which instrument has 88 keys?', options: ['Guitar', 'Organ', 'Piano', 'Harpsichord'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q088', text: 'Who directed the movie "Inception"?', options: ['Steven Spielberg', 'Christopher Nolan', 'James Cameron', 'Martin Scorsese'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q089', text: 'What is the currency of Japan?', options: ['Yuan', 'Won', 'Yen', 'Ringgit'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q090', text: 'How many players are on a soccer team on the field?', options: ['9', '10', '11', '12'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q091', text: 'Which Shakespeare play features the character Hamlet?', options: ['Macbeth', 'Othello', 'Hamlet', 'King Lear'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q092', text: 'What is the name of the fictional continent in Game of Thrones?', options: ['Middle-earth', 'Westeros', 'Narnia', 'Tamriel'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q093', text: 'Which sport is played at Wimbledon?', options: ['Cricket', 'Golf', 'Tennis', 'Badminton'], correctIndex: 2, category: 'Entertainment', difficulty: 1 },
  { id: 'q094', text: 'Who sang "Thriller"?', options: ['Prince', 'Michael Jackson', 'Whitney Houston', 'Elvis Presley'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q095', text: 'What is the longest-running animated TV show?', options: ['The Simpsons', 'South Park', 'Family Guy', 'SpongeBob'], correctIndex: 0, category: 'Entertainment', difficulty: 2 },
  { id: 'q096', text: 'In the movie "The Matrix", what color pill does Neo take?', options: ['Blue', 'Red', 'Green', 'Yellow'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q097', text: 'How many Olympic rings are there?', options: ['4', '5', '6', '7'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q098', text: 'Who wrote "Romeo and Juliet"?', options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correctIndex: 1, category: 'Entertainment', difficulty: 1 },
  { id: 'q099', text: 'What is the most played video game of all time?', options: ['Minecraft', 'Tetris', 'Pac-Man', 'Super Mario Bros'], correctIndex: 1, category: 'Entertainment', difficulty: 2 },
  { id: 'q100', text: 'Which planet in our solar system has the most moons?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], correctIndex: 1, category: 'Entertainment', difficulty: 3 },
];

/**
 * Cryptographically secure Fisher-Yates shuffle.
 * Uses crypto.getRandomValues for unbiased randomness.
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Select random questions from the bank for a game round.
 * Uses Fisher-Yates shuffle with crypto.getRandomValues for fairness.
 */
export function selectQuestions(count: number, category?: string): Question[] {
  let pool = questionBank;
  if (category && category !== 'all') {
    pool = questionBank.filter(q => q.category === category);
  }
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getCategories(): string[] {
  return [...new Set(questionBank.map(q => q.category))];
}
