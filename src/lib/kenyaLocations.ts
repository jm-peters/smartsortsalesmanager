export interface CountyLocation {
  county: string;
  subCounties: {
    name: string;
    towns: string[];
  }[];
}

export const KENYA_COUNTIES: CountyLocation[] = [
  {
    county: 'Nairobi',
    subCounties: [
      { name: 'Westlands', towns: ['Kangemi', 'Westlands', 'Parklands', 'Mountain View'] },
      { name: 'Dagoretti North', towns: ['Kawangware', 'Kilimani', 'Lavington'] },
      { name: 'Dagoretti South', towns: ['Riruta', 'Waithaka', 'Mutuini', 'Uthiru'] },
      { name: 'Langata', towns: ['Langata', 'Karen', 'Nairobi West', 'South C'] },
      { name: 'Kibra', towns: ['Kibera', 'Makina', 'Laini Saba'] },
      { name: 'Roysambu', towns: ['Roysambu', 'Githurai 44', 'Kahawa West', 'Zimmerman'] },
      { name: 'Kasarani', towns: ['Kasarani', 'Clay City', 'Mwiki', 'Njiru'] },
      { name: 'Ruaraka', towns: ['Baba Dogo', 'Utalii', 'Mathare North'] },
      { name: 'Embakasi South', towns: ['Pipeline', 'Kware', 'Mukuru kwa Njenga'] },
      { name: 'Embakasi North', towns: ['Kariobangi North', 'Dandora'] },
      { name: 'Embakasi Central', towns: ['Kayole Central', 'Komarock'] },
      { name: 'Embakasi East', towns: ['Donholm', 'Utawala', 'Embakasi'] },
      { name: 'Embakasi West', towns: ['Umoja', 'Mowlem', 'Kariobangi South'] },
      { name: 'Makadara', towns: ['Makadara', 'Maringo', 'Viwandani'] },
      { name: 'Kamukunji', towns: ['Eastleigh', 'Pumwani', 'Gikomba'] },
      { name: 'Starehe', towns: ['CBD', 'Ngara', 'Pangani', 'Ziwani'] },
    ],
  },
  {
    county: 'Kiambu',
    subCounties: [
      { name: 'Kiambu Town', towns: ['Kiambu', 'Ndumberi', 'Riabai'] },
      { name: 'Ruiru', towns: ['Ruiru', 'Kahawa Sukari', 'Kahawa Wendani', 'Mwihoko'] },
      { name: 'Thika Town', towns: ['Thika', 'Makongeni', 'Section 9'] },
      { name: 'Kikuyu', towns: ['Kikuyu', 'Kinoo', 'Ondiri'] },
      { name: 'Kabete', towns: ['Uthiru', 'Wangige', 'Gitaru'] },
      { name: 'Juja', towns: ['Juja', 'Kalimoni', 'Witeithie'] },
      { name: 'Limuru', towns: ['Limuru', 'Bibirioni', 'Tigoni'] },
      { name: 'Githunguri', towns: ['Githunguri', 'Komothai'] },
    ],
  },
  {
    county: "Murang'a",
    subCounties: [
      { name: 'Kiharu', towns: ["Murang'a Town", 'Mukuyu', 'Kahuro', 'Mbiri', 'Township', 'Mugoiri'] },
      { name: 'Maragwa', towns: ['Kenol', 'Maragua', 'Makuyu', 'Kambiti', 'Ichagaki'] },
      { name: 'Kandara', towns: ['Kandara', 'Gaichanjiru', 'Kagundu-ini', 'Ithiru'] },
      { name: 'Gatanga', towns: ['Gatanga', 'Kirwara', 'Mabanda', 'Jogoo Kimakia'] },
      { name: 'Kigumo', towns: ['Kigumo', 'Kangari', 'Muthithi', 'Kinyona'] },
      { name: 'Mathioya', towns: ['Kiria-ini', 'Gitugi', 'Kamacharia'] },
      { name: 'Kangema', towns: ['Kangema', 'Muguru', 'Kanyenyaini'] },
    ],
  },
  {
    county: 'Mombasa',
    subCounties: [
      { name: 'Mvita', towns: ['Mombasa CBD', 'Majengo', 'Old Town', 'Ganjoni'] },
      { name: 'Nyali', towns: ['Kongowea', 'Nyali', 'Mkomani', 'Frere Town'] },
      { name: 'Kisauni', towns: ['Bamburi', 'Kisauni', 'Mwandoni'] },
      { name: 'Likoni', towns: ['Likoni', 'Shelly Beach', 'Bofu'] },
      { name: 'Changamwe', towns: ['Changamwe', 'Chaani', 'Port Reitz'] },
      { name: 'Jomvu', towns: ['Jomvu Kuu', 'Mikindani'] },
    ],
  },
  {
    county: 'Nakuru',
    subCounties: [
      { name: 'Nakuru Town East', towns: ['Nakuru CBD', 'Free Area', 'Section 58'] },
      { name: 'Nakuru Town West', towns: ['Kaptembwa', 'Rhonda', 'Shabab'] },
      { name: 'Naivasha', towns: ['Naivasha', 'Karagita', 'Kayole'] },
      { name: 'Gilgil', towns: ['Gilgil', 'Kekopey'] },
      { name: 'Molo', towns: ['Molo', 'Elburgon'] },
      { name: 'Njoro', towns: ['Njoro', 'Egerton'] },
      { name: 'Rongai', towns: ['Rongai', 'Kampi ya Moto'] },
    ],
  },
  {
    county: 'Kisumu',
    subCounties: [
      { name: 'Kisumu Central', towns: ['Kisumu CBD', 'Milimani', 'Kondele', 'Manyatta'] },
      { name: 'Kisumu East', towns: ['Kibos', 'Nyalenda', 'Kolwa'] },
      { name: 'Kisumu West', towns: ['Ojolla', 'Maseno'] },
      { name: 'Nyando', towns: ['Ahero', 'Awasi'] },
      { name: 'Muhoroni', towns: ['Muhoroni', 'Chemelil', 'Koru'] },
    ],
  },
  {
    county: 'Uasin Gishu',
    subCounties: [
      { name: 'Ainabkoi', towns: ['Eldoret CBD', 'Kapsoya'] },
      { name: 'Kapseret', towns: ['Langas', 'Pioneer', 'Rivatex'] },
      { name: 'Kesses', towns: ['Moi University', 'Cheptiret'] },
      { name: 'Moiben', towns: ['Moiben', 'Karuna'] },
      { name: 'Soy', towns: ['Eldoret West', 'Huruma', 'Maili Tisa'] },
      { name: 'Turbo', towns: ['Turbo', 'Jua Kali'] },
    ],
  },
  {
    county: 'Machakos',
    subCounties: [
      { name: 'Machakos Town', towns: ['Machakos CBD', 'Mumbuni', 'Kivandini'] },
      { name: 'Mavoko', towns: ['Athi River', 'Syokimau', 'Mlolongo'] },
      { name: 'Kangundo', towns: ['Kangundo', 'Tala'] },
      { name: 'Matungulu', towns: ['Matungulu', 'Koma'] },
    ],
  },
  {
    county: 'Kajiado',
    subCounties: [
      { name: 'Kajiado North', towns: ['Ngong', 'Rongai', 'Kiserian', 'Matasia'] },
      { name: 'Kajiado East', towns: ['Kitengela', 'Isinya'] },
      { name: 'Kajiado Central', towns: ['Kajiado CBD', 'Dalalekutuk'] },
    ],
  },
  {
    county: 'Nyeri',
    subCounties: [
      { name: 'Nyeri Town', towns: ['Nyeri CBD', 'Kamakwa', 'Ruringu'] },
      { name: 'Karatina', towns: ['Karatina', 'Mathira'] },
      { name: 'Othaya', towns: ['Othaya Town', 'Mahiga'] },
    ],
  },
  {
    county: 'Meru',
    subCounties: [
      { name: 'Imenti North', towns: ['Meru CBD', 'Makutano'] },
      { name: 'Imenti South', towns: ['Nkubu', 'Mitunguu'] },
      { name: 'Tigania West', towns: ['Maua', 'Uringu'] },
    ],
  },
  {
    county: 'Kilifi',
    subCounties: [
      { name: 'Kilifi North', towns: ['Kilifi Town', 'Mnarani', 'Tezo'] },
      { name: 'Malindi', towns: ['Malindi Town', 'Shella', 'Ganda'] },
      { name: 'Kaloleni', towns: ['Kaloleni', 'Mariakani'] },
    ],
  },
];
