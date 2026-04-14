---
name: hello-world
description: Print "Hello World" in 10 different languages
---

# Hello World Multilingual

This skill prints "Hello World" in 10 different languages to the terminal.

## Usage

When invoked, this skill displays:

```
English:    Hello World
Spanish:    Hola Mundo
French:     Bonjour le Monde
German:     Hallo Welt
Italian:    Ciao Mondo
Portuguese: Olá Mundo
Japanese:   こんにちは世界
Chinese:    你好世界
Russian:    Привет Мир
Arabic:     مرحبا بالعالم
```

## Implementation

Execute the following command:

```bash
cat << 'EOF'
English:     Hello World
Spanish:     Hola Mundo
French:      Bonjour le Monde
German:      Hallo Welt
Italian:     Ciao Mondo
Portuguese:  Olá Mundo
Japanese:    こんにちは世界
Chinese:     你好世界
Russian:     Привет Мир
Arabic:      مرحبا بالعالم
EOF
```

This skill outputs "Hello World" in:
1. **English** - Hello World
2. **Spanish** - Hola Mundo
3. **French** - Bonjour le Monde
4. **German** - Hallo Welt
5. **Italian** - Ciao Mondo
6. **Portuguese** - Olá Mundo
7. **Japanese** - こんにちは世界 (Konnichiha sekai)
8. **Chinese** - 你好世界 (Nǐ hǎo shìjiè)
9. **Russian** - Привет Мир (Privet Mir)
10. **Arabic** - مرحبا بالعالم (Marhaba bialealim)
