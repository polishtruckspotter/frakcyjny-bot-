# Frakcyjny Bot Poznań RP

Polski bot Discorda z systemem prywatnych zgłoszeń. Administrator konfiguruje panel poleceniem `/setup tickets`, a użytkownicy wybierają rodzaj sprawy z menu rozwijanego. Każdy kanał widzi autor zgłoszenia oraz role wybrane podczas konfiguracji. Zgłoszenie zamyka się poleceniem `/zamknij` — bot nie używa przycisków.

## Uruchomienie lokalne

1. Zainstaluj Node.js 20 lub nowszy.
2. Uruchom `npm install`.
3. Skopiuj `.env.example` do `.env` i wpisz token bota w `DISCORD_TOKEN`.
4. Uruchom `npm start`.

Nie udostępniaj tokenu i nie dodawaj pliku `.env` do repozytorium.

## Wdrożenie na Wispbyte

1. Wgraj pliki projektu na serwer. Nie musisz wysyłać folderu `node_modules`.
2. Wybierz Node.js 20 lub nowszy.
3. W panelu Wispbyte ustaw zmienną środowiskową `DISCORD_TOKEN` na token bota z Discord Developer Portal.
4. Ustaw zmienną `JS_FILE` na `index.js`. Plik startowy w katalogu głównym przekazuje uruchomienie do `src/index.js`. Jeśli panel pozwala ustawić własną komendę startową, możesz też użyć `npm start`.
5. Uruchom serwer. Po zalogowaniu bot zarejestruje polecenia na serwerach KGP i BOA, a następnie wyświetli swój status w konsoli.

Bot nie potrzebuje otwartego portu. W Discord Developer Portal nadaj mu uprawnienia do wyświetlania kanałów, wysyłania wiadomości, odczytywania historii oraz zarządzania kanałami. Przy zapraszaniu aplikacji uwzględnij zakresy `bot` i `applications.commands`.

Bot rejestruje polecenia tylko na dwóch wskazanych serwerach: KGP (`1562984483190345892`) i BOA (`1557401688158117958`). Musi być zaproszony na oba; jeśli któregoś brakuje, rejestracja poleceń zgłosi błąd w konsoli.

## Konfiguracja zgłoszeń

1. Utwórz rolę zespołu wsparcia na serwerze Discord.
2. Upewnij się, że bot ma uprawnienie **Zarządzanie kanałami** i może wysyłać wiadomości na kanale panelu.
3. Użyj `/setup tickets` i ustaw kanał panelu, kategorię dla ticketów oraz od jednej do trzech ról, które mają widzieć zgłoszenia.
4. Bot publikuje panel na wybranym kanale. Nowe kanały są tworzone w wybranej kategorii; autor zgłoszenia, wskazane role oraz bot otrzymują do nich dostęp.

Menu zawiera osobne kategorie dla pytań ogólnych, spraw z EH, zdarzeń na Discordzie, usterek technicznych, odwołań od kar i propozycji współpracy. Autor zgłoszenia może zamknąć je poleceniem `/zamknij`; kanał zostaje zachowany dla zespołu wsparcia.

## Konfiguracja weryfikacji

1. Użyj `/setup weryfikacja` i wybierz kanał panelu, dwie role do nadania po poprawnej odpowiedzi oraz rolę do zdjęcia.
2. Bot opublikuje dropdown. Użytkownik odpowiada na krótkie dodawanie w formularzu; poprawna odpowiedź nadaje obie role i zdejmuje wskazaną rolę.
3. Bot potrzebuje uprawnienia **Zarządzanie rolami**. Ustaw jego najwyższą rolę wyżej niż wszystkie role wskazane w konfiguracji.

Każde działanie ma jedną próbę i wygasa po pięciu minutach. Błędna odpowiedź pozwala rozpocząć nową próbę z panelu.

## Konfiguracja rekrutacji

1. Użyj `/setup rekrutacja` na serwerze i wybierz organizację, kanał panelu, kanał logów, role recenzentów oraz role nadawane po przyjęciu.
2. Na KGP wymagane są role dla KPP, WRD i OPP; na BOA wymagana jest rola BOA. Wybrana organizacja musi odpowiadać serwerowi.
3. Bot opublikuje dropdown na kanale panelu. Kandydat wybierze jednostkę, a pytania i odpowiedzi przejdą w prywatnych DM między nim a botem.
4. Kandydatury pojawią się w kanale logów z przyciskami **Akceptuj** i **Odrzuć**. Recenzent musi podać uzasadnienie; przy akceptacji bot nada odpowiednią rolę.
5. Ogranicz widoczność kanału logów do recenzentów i administracji. Bot wymaga uprawnienia **Zarządzanie rolami** oraz najwyższej roli ustawionej nad rolami używanymi przy weryfikacji i rekrutacji.

Każda jednostka ma dziewięć pytań. Postęp, odpowiedzi, konfiguracja i decyzje są zapisywane w `data/recruitment.json`. Po restarcie kandydat może wznowić formularz poleceniem `/rekrutacja`; zapisane odpowiedzi i oczekujące logi są zachowywane. Bot zapisuje odpowiedź po jej wysłaniu, więc tekst wpisany, ale niewysłany przed restartem nie może zostać odzyskany. Zachowaj ten plik przy przenoszeniu lub ponownym wdrażaniu serwera.
