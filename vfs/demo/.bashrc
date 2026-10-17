export PS1='\[\033[01;32m\]demo@osjs\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
export PATH="/app/applet/bin:$PATH"

alias ll='ls -la --color=auto'
alias ls='ls --color=auto'

echo -e "\033[1;36m=========================================================\033[0m"
echo -e "\033[1;32m Welcome to OS.js Cloud Desktop Interactive Shell\033[0m"
echo -e " Connected to OS.js Core & VFS (\033[33mhome:/\033[0m)"
echo -e " Run '\033[1;32mosjs help\033[0m' or '\033[1;32mosjs apps\033[0m' to interact with the OS."
echo -e "\033[1;36m=========================================================\033[0m"
